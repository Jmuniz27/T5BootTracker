"""Un lead no puede usar el email de un miembro del staff (CB-345).

Antes de esto no había validación en LeadWriteSerializer: se podía crear un
lead con el correo de cualquier admin/vendedor/finanzas/coordinador, y ese
lead quedaba visible con su nombre en "Convertidos" (converted_leads es
visible para cualquier vendedor) sin que la conversión llegara a completarse
de verdad — el guard de conversión ya rechazaba ese email con 409
EMAIL_CONFLICT, pero el lead "sucio" seguía ahí.
"""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead

LEADS_URL = '/api/leads/'
CEDULA = '1713175071'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def qualify(lead):
    lead.status = Lead.Status.QUALIFIED
    lead.save(update_fields=['status'])
    return lead


def convert_url(lead):
    return f'/api/leads/{lead.id}/convert/'


class TestLeadCreateRejectsStaffEmail:
    @pytest.mark.parametrize('role', [
        CustomUser.Role.ADMINISTRATOR,
        CustomUser.Role.SALESPERSON,
        CustomUser.Role.FINANCE,
        CustomUser.Role.COORDINATOR,
    ])
    def test_creating_a_lead_with_a_staff_email_is_rejected(self, db, salesperson_user, role):
        staff = CustomUser.objects.create_user(
            email='staff@test.com', password='testpass123',
            first_name='Staff', last_name='Person', role=role,
        )
        resp = make_client(salesperson_user).post(LEADS_URL, {
            'name': 'Sospechoso',
            'phone': '0999999999',
            'email': staff.email,
            'source': Lead.Source.MANUAL,
        }, format='json')

        assert resp.status_code == 400
        assert 'email' in resp.json()
        assert not Lead.objects.filter(email=staff.email).exists()

    def test_creating_a_lead_with_an_existing_bootcamper_email_is_allowed(
        self, db, salesperson_user, bootcamper_user,
    ):
        """Un bootcamper recurrente sigue pudiendo generar un lead nuevo."""
        resp = make_client(salesperson_user).post(LEADS_URL, {
            'name': 'Recurrente',
            'phone': '0999999999',
            'email': bootcamper_user.email,
            'source': Lead.Source.MANUAL,
        }, format='json')

        assert resp.status_code == 201
        assert Lead.objects.filter(email=bootcamper_user.email).exists()

    def test_creating_a_lead_with_a_brand_new_email_is_allowed(self, db, salesperson_user):
        resp = make_client(salesperson_user).post(LEADS_URL, {
            'name': 'Nuevo',
            'phone': '0999999999',
            'email': 'nunca.visto@test.com',
            'source': Lead.Source.MANUAL,
        }, format='json')

        assert resp.status_code == 201

    def test_creating_a_lead_without_an_email_is_still_allowed(self, db, salesperson_user):
        """El email es opcional en Lead — no hay que exigirlo para validar."""
        resp = make_client(salesperson_user).post(LEADS_URL, {
            'name': 'Sin correo',
            'phone': '0999999999',
            'source': Lead.Source.MANUAL,
        }, format='json')

        assert resp.status_code == 201

    def test_updating_a_lead_to_a_staff_email_is_also_rejected(self, db, admin_user, sample_lead):
        """PATCH pasa por el mismo serializer (LeadAdminWriteSerializer hereda de él)."""
        staff = CustomUser.objects.create_user(
            email='otro-staff@test.com', password='testpass123',
            first_name='Otro', last_name='Staff', role=CustomUser.Role.FINANCE,
        )
        resp = make_client(admin_user).patch(
            f'{LEADS_URL}{sample_lead.id}/', {'email': staff.email}, format='json',
        )
        assert resp.status_code == 400


class TestConversionRejectsLeadWithStaffEmail:
    """Cierra el caso de datos previos al fix, o de un lead editado después de
    creado: si el email DEL LEAD (no el que se teclea al convertir) es de
    staff, la conversión se corta antes de crear nada."""

    def test_conversion_is_blocked_when_the_lead_email_belongs_to_staff(
        self, db, salesperson_user, program, assigned_lead,
    ):
        staff = CustomUser.objects.create_user(
            email='lead-envenenado@test.com', password='testpass123',
            first_name='Staff', last_name='Envenenado', role=CustomUser.Role.ADMINISTRATOR,
        )
        # Se fuerza el email directo en el modelo: simula un lead creado antes
        # del fix de LeadWriteSerializer, o editado por otra vía.
        assigned_lead.email = staff.email
        assigned_lead.save(update_fields=['email'])

        resp = make_client(salesperson_user).post(
            convert_url(qualify(assigned_lead)),
            {'cedula': CEDULA, 'program_id': str(program.id), 'email': 'email.nuevo@test.com'},
            format='json',
        )

        assert resp.status_code == 409
        assert resp.json()['code'] == 'LEAD_EMAIL_CONFLICT'
        assert not CustomUser.objects.filter(email='email.nuevo@test.com').exists()
        assigned_lead.refresh_from_db()
        assert assigned_lead.status != Lead.Status.CONVERTED

    def test_conversion_still_works_when_the_lead_email_is_a_bootcamper(
        self, db, salesperson_user, program, assigned_lead, bootcamper_user,
    ):
        assigned_lead.email = bootcamper_user.email
        assigned_lead.save(update_fields=['email'])

        resp = make_client(salesperson_user).post(
            convert_url(qualify(assigned_lead)),
            {'cedula': CEDULA, 'program_id': str(program.id), 'email': bootcamper_user.email},
            format='json',
        )

        assert resp.status_code in (200, 201)
