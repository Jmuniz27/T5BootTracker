"""Tests for duplicate-lead detection on manual creation (CB-127 / CR-011)."""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.leads.models import Lead

LEADS_URL = '/api/leads/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


class TestLeadDuplicateDetection:
    def test_create_lead_duplicate_by_phone_returns_409_without_creating(self, db, salesperson_user):
        Lead.objects.create(name='Original', phone='0991234567')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Duplicado',
            'phone': '0991234567',
        }, format='json')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'POSSIBLE_DUPLICATE'
        assert Lead.objects.filter(name='Duplicado').count() == 0

    def test_create_lead_duplicate_by_email_returns_409_without_creating(self, db, salesperson_user):
        Lead.objects.create(name='Original', phone='0990000000', email='dup@test.com')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Duplicado',
            'phone': '0991111111',
            'email': 'dup@test.com',
        }, format='json')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'POSSIBLE_DUPLICATE'
        assert resp.json()['duplicate']['email'] == 'dup@test.com'
        assert Lead.objects.filter(name='Duplicado').count() == 0

    def test_create_lead_no_duplicate_creates_normally(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Lead Nuevo',
            'phone': '0995551234',
        }, format='json')
        assert resp.status_code == 201
        assert Lead.objects.filter(name='Lead Nuevo').exists()

    def test_create_lead_with_confirm_duplicate_creates_despite_duplicate(self, db, salesperson_user):
        Lead.objects.create(name='Original', phone='0991234567')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Duplicado Confirmado',
            'phone': '0991234567',
            'confirm_duplicate': True,
        }, format='json')
        assert resp.status_code == 201
        assert Lead.objects.filter(name='Duplicado Confirmado').exists()

    def test_duplicate_check_ignores_blank_email(self, db, salesperson_user):
        Lead.objects.create(name='Sin Email A', phone='0990000001')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Sin Email B',
            'phone': '0990000002',
        }, format='json')
        assert resp.status_code == 201
        assert Lead.objects.filter(name='Sin Email B').exists()


class TestDuplicateCrossesPhoneFormats:
    """El teléfono del bot llega en E.164 y el del CRM en formato local.

    Comparar exacto nunca cruza los dos, así que un vendedor podía duplicar sin
    aviso un lead que el bot ya había creado — justo lo que el bot evita.
    """

    def test_local_phone_finds_the_lead_the_bot_saved_international(self, db, salesperson_user):
        Lead.objects.create(name='Del Bot', phone='593991234567', source=Lead.Source.WHATSAPP)
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {'name': 'Duplicado', 'phone': '0991234567'}, format='json')

        assert resp.status_code == 409
        assert resp.json()['duplicate']['name'] == 'Del Bot'
        assert Lead.objects.filter(name='Duplicado').count() == 0

    def test_international_phone_finds_the_lead_saved_locally(self, db, salesperson_user):
        Lead.objects.create(name='Manual', phone='0991234567')
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {'name': 'Duplicado', 'phone': '593991234567'}, format='json')

        assert resp.status_code == 409
        assert resp.json()['duplicate']['name'] == 'Manual'

    def test_a_phone_saved_with_separators_still_matches(self, db, salesperson_user):
        """La columna es texto libre: hay teléfonos con guiones escritos a mano."""
        Lead.objects.create(name='Con Guiones', phone='099-123-4567')
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {'name': 'Duplicado', 'phone': '593991234567'}, format='json')

        assert resp.status_code == 409
        assert resp.json()['duplicate']['name'] == 'Con Guiones'

    def test_a_different_subscriber_number_is_not_a_duplicate(self, db, salesperson_user):
        """Discrimina: el cruce por abonado no puede volverse un comodín."""
        Lead.objects.create(name='Otro', phone='0991234567')
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {'name': 'Legitimo', 'phone': '0987654321'}, format='json')

        assert resp.status_code == 201
        assert Lead.objects.filter(name='Legitimo').count() == 1


class TestDuplicateByNameAndProgram:
    """Misma persona registrándose desde otro teléfono."""

    def test_same_name_and_program_with_a_different_phone_warns(self, db, salesperson_user):
        Lead.objects.create(name='Ana Vera', phone='0991111111', program_interest='Data Science')
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {
            'name': 'Ana Vera', 'phone': '0992222222', 'program_interest': 'Data Science',
        }, format='json')

        assert resp.status_code == 409
        assert resp.json()['duplicate']['name'] == 'Ana Vera'

    def test_the_comparison_ignores_case_accents_and_extra_spaces(self, db, salesperson_user):
        Lead.objects.create(name='Ana Vera', phone='0991111111', program_interest='Data Science')
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {
            'name': '  ANA   VÉRA ', 'phone': '0992222222', 'program_interest': 'data science',
        }, format='json')

        assert resp.status_code == 409

    def test_same_name_but_a_different_program_is_not_a_duplicate(self, db, salesperson_user):
        """El programa es lo que acota: sólo el nombre daría falsos positivos."""
        Lead.objects.create(name='Ana Vera', phone='0991111111', program_interest='Data Science')
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {
            'name': 'Ana Vera', 'phone': '0992222222', 'program_interest': 'Full Stack',
        }, format='json')

        assert resp.status_code == 201

    def test_the_name_alone_without_a_program_is_not_enough(self, db, salesperson_user):
        Lead.objects.create(name='Ana Vera', phone='0991111111')
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {'name': 'Ana Vera', 'phone': '0992222222'}, format='json')

        assert resp.status_code == 201

    def test_a_discarded_lead_does_not_block_registering_again(self, db, salesperson_user):
        """Descartar es un final: no puede dejar a la persona sin poder volver."""
        Lead.objects.create(
            name='Ana Vera', phone='0991111111', program_interest='Data Science',
            status=Lead.Status.DISCARDED,
        )
        client = make_client(salesperson_user)

        resp = client.post(LEADS_URL, {
            'name': 'Ana Vera', 'phone': '0992222222', 'program_interest': 'Data Science',
        }, format='json')

        assert resp.status_code == 201
