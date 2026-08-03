"""Medición del número de queries de PaymentMonitoringView (hallazgo PERF-1).

Estos tests no fijan un contrato de negocio: cuantifican el costo actual del
endpoint para poder documentar el antes/después de la optimización (T1.5 del
plan de entrega) con números reales y no con estimaciones.

Con T1.5 cerrada (values()/annotate() en get_monitoring_summaries), estos
tests fijan el contrato de performance: el número de queries del endpoint es
constante respecto a la cantidad de bootcampers, y el programa se consulta una
sola vez por request. Si vuelven a fallar, alguien reintrodujo el N+1.
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
        """El costo del endpoint no depende del número de bootcampers (T1.5).

        La vista agrega por (bootcamper, programa) con values()/annotate() en
        una sola consulta más una de usuarios, así que pasar de 2 a 6
        bootcampers no puede añadir queries.
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

        incremento_por_bootcamper = (queries_con_6 - queries_con_2) / 4

        print(
            f"\n[PERF-1] monitoring con 2 bootcampers: {queries_con_2} queries · "
            f"con 6: {queries_con_6} queries · "
            f"incremento por bootcamper: {incremento_por_bootcamper:.1f}"
        )

        # Se afirma el incremento, no el total: el valor absoluto depende de
        # las queries de autenticación y cambiaría por motivos ajenos.
        assert incremento_por_bootcamper == 0, (
            "El endpoint vuelve a escalar con el número de bootcampers: se "
            "reintrodujo el N+1 que T1.5 eliminó (PERF-1)."
        )

    def test_monitoring_repite_la_consulta_del_programa(self, salesperson_user, program):
        """El programa se consulta una sola vez por request (T1.5).

        Antes `get_payment_summary` releía el programa por cada bootcamper;
        ahora la vista lo carga una vez y el servicio lo recibe ya resuelto.
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
        assert len(consultas_de_programa) == 1, (
            "El programa se está consultando más de una vez por request: se "
            "reintrodujo parte del N+1 de PERF-1."
        )
