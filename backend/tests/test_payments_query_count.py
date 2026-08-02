"""Medición del número de queries de PaymentMonitoringView (hallazgo PERF-1).

Estos tests no fijan un contrato de negocio: cuantifican el costo actual del
endpoint para poder documentar el antes/después de la optimización (T1.5 del
plan de entrega) con números reales y no con estimaciones.

Sirven además como red de seguridad: cuando la vista se reescriba con
values()/annotate(), el número de queries debe dejar de crecer con la cantidad
de bootcampers. `test_monitoring_no_escala_con_bootcampers` es el que falla si
la reescritura no logra eso, y es el que hay que actualizar al cerrar T1.5.
"""
from decimal import Decimal

import pytest
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.test import APIClient

from apps.authentication.models import CustomUser

MONITORING_URL = "/api/payments/monitoring/"


def make_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def crear_bootcamper_con_pago(program, indice):
    """Bootcamper con un pago aprobado en el programa dado."""
    from apps.payments.models import Payment

    bootcamper = CustomUser.objects.create_user(
        email=f"bootcamper.perf{indice}@test.com",
        password="testpass123",
        first_name=f"Boot{indice}",
        last_name="Perf",
        role=CustomUser.Role.BOOTCAMPER,
    )
    Payment.objects.create(
        bootcamper=bootcamper,
        program=program,
        receipt_file=f"receipts/perf{indice}.jpg",
        receipt_file_type="image",
        status=Payment.Status.APPROVED,
        confirmed_amount=Decimal("100.00"),
        confirmed_bank_name="Banco Pichincha",
    )
    return bootcamper


@pytest.mark.django_db
class TestMonitoringQueryCount:
    def test_monitoring_no_escala_con_bootcampers(self, salesperson_user, program):
        """El costo del endpoint no debería depender del número de bootcampers.

        Hoy sí depende: `get_payment_summary` se llama una vez por bootcamper y
        cada llamada dispara su propio `Program.objects.get()` más dos consultas
        de agregación. Este test documenta esa relación lineal.
        """
        client = make_client(salesperson_user)
        url = f"{MONITORING_URL}?program_id={program.id}"

        for i in range(2):
            crear_bootcamper_con_pago(program, i)
        with CaptureQueriesContext(connection) as ctx_2:
            assert client.get(url).status_code == 200
        queries_con_2 = len(ctx_2)

        for i in range(2, 6):
            crear_bootcamper_con_pago(program, i)
        with CaptureQueriesContext(connection) as ctx_6:
            assert client.get(url).status_code == 200
        queries_con_6 = len(ctx_6)

        # Cuatro bootcampers más ⇒ cuánto crece el costo. Con la vista actual
        # el incremento es de ~4 queries por bootcamper; tras T1.5 debería ser 0.
        incremento_por_bootcamper = (queries_con_6 - queries_con_2) / 4

        print(
            f"\n[PERF-1] monitoring con 2 bootcampers: {queries_con_2} queries · "
            f"con 6: {queries_con_6} queries · "
            f"incremento por bootcamper: {incremento_por_bootcamper:.1f}"
        )

        # Se afirma la relación lineal, no un número exacto: el valor absoluto
        # depende de las queries de autenticación y cambiaría por motivos ajenos.
        assert incremento_por_bootcamper > 0, (
            "El endpoint ya no escala con el número de bootcampers: la optimización "
            "de T1.5 está hecha. Actualizar este test para fijar el nuevo contrato "
            "(incremento == 0) y documentar el después en docs/profiling/."
        )

    def test_monitoring_repite_la_consulta_del_programa(self, salesperson_user, program):
        """`Program.objects.get()` se repite una vez por bootcamper.

        Es la parte más evitable de PERF-1: el programa ya se conoce en la vista
        y aun así el servicio lo vuelve a leer en cada iteración.
        """
        client = make_client(salesperson_user)

        for i in range(3):
            crear_bootcamper_con_pago(program, i)

        with CaptureQueriesContext(connection) as ctx:
            assert client.get(f"{MONITORING_URL}?program_id={program.id}").status_code == 200

        consultas_de_programa = [
            q for q in ctx.captured_queries if 'FROM "programs_program"' in q["sql"]
        ]
        print(
            f"\n[PERF-1] consultas a programs_program con 3 bootcampers: "
            f"{len(consultas_de_programa)}"
        )
        assert len(consultas_de_programa) >= 3, (
            "La consulta del programa ya no se repite por bootcamper: revisar si "
            "T1.5 está hecha y actualizar este test."
        )
