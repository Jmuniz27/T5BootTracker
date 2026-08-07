"""Métricas por vendedor acotadas por período (#337).

La clienta pidió comparar "en el último año, este vendedor o dos vendedores,
cuántos leads en total ha manejado y cuántos convertidos ha tenido".

Se acota por **fecha de asignación**: esta vista mide gestión del vendedor, y lo
que le corresponde de un lead empieza cuando se lo asignan.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead

URL = '/api/users/salespeople/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def crear_lead(owner, *, dias_atras, status=Lead.Status.INTERESTED, telefono='0990000000'):
    lead = Lead.objects.create(
        name=f'Lead {dias_atras}d', phone=telefono, status=status, owner=owner,
    )
    lead.assigned_at = timezone.now() - timedelta(days=dias_atras)
    lead.save(update_fields=['assigned_at'])
    return lead


def fila(resp, vendedor):
    return next(r for r in resp.json() if r['salesperson_id'] == str(vendedor.id))


@pytest.fixture
def vendedor(db):
    return CustomUser.objects.create_user(
        email='vendedor.rango@test.com', password='testpass123',
        first_name='Ana', last_name='Rango', role=CustomUser.Role.SALESPERSON,
    )


class TestSalespeopleRange:
    def test_sin_fechas_cuenta_todo_el_historico(self, db, admin_user, vendedor):
        # El comportamiento anterior no cambia: la vista por defecto agrega todo.
        crear_lead(vendedor, dias_atras=30, telefono='0990000001')
        crear_lead(vendedor, dias_atras=800, telefono='0990000002')

        resp = make_client(admin_user).get(URL)

        assert fila(resp, vendedor)['assigned_leads'] == 2

    def test_acota_por_fecha_de_asignacion(self, db, admin_user, vendedor):
        crear_lead(vendedor, dias_atras=30, telefono='0990000001')
        crear_lead(vendedor, dias_atras=800, telefono='0990000002')

        desde = (timezone.now() - timedelta(days=365)).date()
        resp = make_client(admin_user).get(URL, {'fecha_desde': desde.isoformat()})

        # El de hace 800 días queda fuera del último año.
        assert fila(resp, vendedor)['assigned_leads'] == 1

    def test_la_tasa_se_recalcula_sobre_el_periodo(self, db, admin_user, vendedor):
        # Dentro del año: 2 leads, 1 convertido -> 50%.
        crear_lead(vendedor, dias_atras=10, telefono='0990000001')
        crear_lead(vendedor, dias_atras=20, status=Lead.Status.CONVERTED, telefono='0990000002')
        # Fuera del año: 4 leads sin convertir, que hundirían la tasa histórica.
        for i in range(4):
            crear_lead(vendedor, dias_atras=700 + i, telefono=f'099100000{i}')

        client = make_client(admin_user)
        historico = fila(client.get(URL), vendedor)
        desde = (timezone.now() - timedelta(days=365)).date()
        acotado = fila(client.get(URL, {'fecha_desde': desde.isoformat()}), vendedor)

        assert historico['assigned_leads'] == 6
        assert historico['conversion_rate'] == pytest.approx(16.7, abs=0.1)
        # No se recorta la tasa histórica: se recalcula sobre el subconjunto.
        assert acotado['assigned_leads'] == 2
        assert acotado['conversion_rate'] == 50.0

    def test_fecha_hasta_recorta_por_arriba(self, db, admin_user, vendedor):
        crear_lead(vendedor, dias_atras=5, telefono='0990000001')
        crear_lead(vendedor, dias_atras=100, telefono='0990000002')

        hasta = (timezone.now() - timedelta(days=50)).date()
        resp = make_client(admin_user).get(URL, {'fecha_hasta': hasta.isoformat()})

        assert fila(resp, vendedor)['assigned_leads'] == 1

    def test_los_sin_contactar_tambien_se_acotan(self, db, admin_user, vendedor):
        # Si no se acotaran, un vendedor podria salir con mas "sin contactar"
        # que leads asignados en el mismo periodo.
        crear_lead(vendedor, dias_atras=700, telefono='0990000002')

        desde = (timezone.now() - timedelta(days=365)).date()
        acotado = fila(make_client(admin_user).get(URL, {'fecha_desde': desde.isoformat()}), vendedor)

        assert acotado['assigned_leads'] == 0
        assert acotado['uncontacted_leads'] == 0

    def test_una_fecha_invalida_se_ignora_en_vez_de_romper(self, db, admin_user, vendedor):
        crear_lead(vendedor, dias_atras=10, telefono='0990000001')

        resp = make_client(admin_user).get(URL, {'fecha_desde': 'no-es-fecha'})

        assert resp.status_code == 200
        assert fila(resp, vendedor)['assigned_leads'] == 1

    def test_un_vendedor_sin_leads_en_el_periodo_sigue_apareciendo(self, db, admin_user, vendedor):
        # En ceros, no ausente: si desapareciera parecería que no existe.
        crear_lead(vendedor, dias_atras=900, telefono='0990000002')

        desde = (timezone.now() - timedelta(days=365)).date()
        resp = make_client(admin_user).get(URL, {'fecha_desde': desde.isoformat()})

        assert fila(resp, vendedor)['assigned_leads'] == 0
        assert fila(resp, vendedor)['conversion_rate'] == 0.0

    def test_un_lead_viejo_asignado_hace_poco_cuenta_en_el_periodo(self, db, admin_user, vendedor):
        """Fija el criterio: acota por asignación, no por creación.

        Un lead creado hace dos años pero asignado la semana pasada es trabajo de
        la semana pasada. Si se acotara por created_at —como hacen los KPIs de
        analítica— este lead desaparecería y el vendedor aparecería sin gestión.
        """
        lead = crear_lead(vendedor, dias_atras=3, telefono='0990000009')
        Lead.objects.filter(pk=lead.pk).update(
            created_at=timezone.now() - timedelta(days=730),
        )

        desde = (timezone.now() - timedelta(days=365)).date()
        resp = make_client(admin_user).get(URL, {'fecha_desde': desde.isoformat()})

        assert fila(resp, vendedor)['assigned_leads'] == 1
