"""Programa y cohorte del bootcamper en la tabla de usuarios (#328).

La clienta los agrupa por cohorte: "algo que creo que nos falta aquí es de qué
cohorte son [...] podríamos agregar es el programa y la cohorte".
"""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser

USERS_URL = '/api/users/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def fila(resp, user):
    filas = resp.json().get('results', resp.json())
    return next(row for row in filas if row['id'] == str(user.id))


@pytest.fixture
def cohorte(db, program):
    from apps.programs.models import Cohort
    return Cohort.objects.create(
        program=program, number=3,
        start_month=program.start_date, end_month=program.end_date,
        status=Cohort.Status.IN_PROGRESS,
    )


@pytest.fixture
def inscrito(db, program, cohorte):
    from apps.programs.models import Enrollment
    bootcamper = CustomUser.objects.create_user(
        email='inscrito@test.com', password='testpass123',
        first_name='Ana', last_name='Torres', role=CustomUser.Role.BOOTCAMPER,
    )
    Enrollment.objects.create(
        bootcamper=bootcamper, bootcamp=program, cohort=cohorte,
        status=Enrollment.Status.ACTIVE,
        start_date=program.start_date, agreed_price=program.total_cost,
    )
    return bootcamper


class TestUserEnrollments:
    def test_el_bootcamper_trae_programa_y_cohorte(self, db, admin_user, inscrito, program, cohorte):
        resp = make_client(admin_user).get(USERS_URL)

        assert resp.status_code == 200
        matricula = fila(resp, inscrito)['enrollments'][0]
        assert matricula['program_id'] == str(program.id)
        assert matricula['program_name'] == program.name
        assert matricula['cohort_number'] == 3
        assert matricula['cohort_status'] == 'IN_PROGRESS'

    def test_un_bootcamper_sin_cohorte_trae_el_programa_igual(self, db, admin_user, program):
        # Se puede convertir sin cohorte: el programa puede no tener ninguna creada.
        from apps.programs.models import Enrollment
        sin_cohorte = CustomUser.objects.create_user(
            email='sincohorte@test.com', password='testpass123',
            first_name='Luis', last_name='Vera', role=CustomUser.Role.BOOTCAMPER,
        )
        Enrollment.objects.create(
            bootcamper=sin_cohorte, bootcamp=program, status=Enrollment.Status.ACTIVE,
            start_date=program.start_date, agreed_price=program.total_cost,
        )

        matricula = fila(make_client(admin_user).get(USERS_URL), sin_cohorte)['enrollments'][0]
        assert matricula['program_name'] == program.name
        assert matricula['cohort_number'] is None
        assert matricula['cohort_id'] is None

    def test_un_bootcamper_sin_inscripcion_trae_la_lista_vacia(self, db, admin_user, bootcamper_user):
        assert fila(make_client(admin_user).get(USERS_URL), bootcamper_user)['enrollments'] == []

    def test_quien_no_es_bootcamper_no_trae_inscripciones(self, db, admin_user, salesperson_user):
        # Un vendedor no cursa nada: la columna no aplica.
        assert fila(make_client(admin_user).get(USERS_URL), salesperson_user)['enrollments'] == []

    def test_quien_cursa_dos_programas_los_trae_a_los_dos(self, db, admin_user, inscrito, program):
        from apps.programs.models import Enrollment, Program
        otro = Program.objects.create(
            name='Data Science', start_date=program.start_date,
            end_date=program.end_date, total_cost=900,
        )
        Enrollment.objects.create(
            bootcamper=inscrito, bootcamp=otro, status=Enrollment.Status.ACTIVE,
            start_date=otro.start_date, agreed_price=otro.total_cost,
        )

        matriculas = fila(make_client(admin_user).get(USERS_URL), inscrito)['enrollments']
        assert {m['program_name'] for m in matriculas} == {program.name, 'Data Science'}

    def test_el_listado_no_dispara_un_n_mas_uno(self, db, admin_user, program, cohorte, django_assert_num_queries):
        """El número de consultas no crece con la cantidad de bootcampers.

        Se compara el mismo listado con pocas y con muchas filas en vez de fijar
        un número mágico: lo que importa es que sea constante, no cuánto vale.
        """
        from apps.programs.models import Enrollment

        def inscribir(indice):
            bootcamper = CustomUser.objects.create_user(
                email=f'masivo{indice}@test.com', password='testpass123',
                first_name=f'B{indice}', last_name='Test', role=CustomUser.Role.BOOTCAMPER,
            )
            Enrollment.objects.create(
                bootcamper=bootcamper, bootcamp=program, cohort=cohorte,
                status=Enrollment.Status.ACTIVE,
                start_date=program.start_date, agreed_price=program.total_cost,
            )

        client = make_client(admin_user)

        for i in range(2):
            inscribir(i)
        with django_assert_num_queries(7):
            client.get(USERS_URL)

        for i in range(2, 12):
            inscribir(i)
        with django_assert_num_queries(7):
            client.get(USERS_URL)
