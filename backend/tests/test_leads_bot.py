"""Tests for the WhatsApp bot integration surface of the leads app."""
from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils.timezone import now
from rest_framework.test import APIClient, APIRequestFactory

from apps.leads.bot_permissions import BOT_TOKEN_HEADER, IsJelouBot
from apps.leads.models import Lead
from apps.leads.services import find_lead_by_phone, normalize_phone

BOT_TOKEN = 'un-secreto-de-prueba-suficientemente-largo'


class TestNormalizePhone:
    """normalize_phone keeps digits and nothing else."""

    @pytest.mark.parametrize('raw, expected', [
        ('0991000001',        '0991000001'),
        ('593991000001',      '593991000001'),
        ('+593 99 100 0001',  '593991000001'),
        ('099-100-0001',      '0991000001'),
        ('(04) 123 4567',     '041234567'),
        ('  0991000001  ',    '0991000001'),
    ])
    def test_strips_everything_but_digits(self, raw, expected):
        assert normalize_phone(raw) == expected

    @pytest.mark.parametrize('raw', ['', None, 'sin numero', '+++', '   '])
    def test_returns_empty_when_there_are_no_digits(self, raw):
        assert normalize_phone(raw) == ''


@pytest.mark.django_db
class TestFindLeadByPhone:
    """The lookup crosses the local and international formats of one number."""

    def test_finds_local_lead_from_international_format(self):
        """The blocker this exists for: WhatsApp sends 593…, the CRM stores 099…"""
        lead = Lead.objects.create(name='Ana Local', phone='0991000001')

        assert find_lead_by_phone('593991000001') == lead

    def test_finds_international_lead_from_local_format(self):
        """The reverse direction, for leads that did come in through the bot."""
        lead = Lead.objects.create(name='Beto Intl', phone='593991000002')

        assert find_lead_by_phone('0991000002') == lead

    def test_finds_lead_with_the_same_format_it_was_saved_in(self):
        lead = Lead.objects.create(name='Caro Igual', phone='0991000003')

        assert find_lead_by_phone('0991000003') == lead

    def test_finds_lead_saved_with_separators(self):
        """The column is free text, so the query has to strip it too."""
        lead = Lead.objects.create(name='Dario Guiones', phone='099-100-0004')

        assert find_lead_by_phone('593991000004') == lead

    def test_finds_lead_when_the_query_carries_a_plus_prefix(self):
        lead = Lead.objects.create(name='Elsa Plus', phone='0991000005')

        assert find_lead_by_phone('+593 99 100 0005') == lead

    def test_returns_none_when_no_lead_matches(self):
        Lead.objects.create(name='Otra Persona', phone='0991000006')

        assert find_lead_by_phone('593987654321') is None

    @pytest.mark.parametrize('raw', ['', None, 'sin numero', '12345678'])
    def test_returns_none_for_input_without_enough_digits(self, raw):
        """Fewer than 9 digits cannot identify a subscriber — no guessing."""
        Lead.objects.create(name='Alguien', phone='0991000007')

        assert find_lead_by_phone(raw) is None

    def test_exact_match_wins_over_a_more_recent_subscriber_match(self):
        """Two leads sharing the subscriber number: the whole-number match wins."""
        exact = Lead.objects.create(name='Con Codigo', phone='593991000008')
        recent = Lead.objects.create(name='Sin Codigo', phone='0991000008')
        Lead.objects.filter(pk=exact.pk).update(created_at=now() - timedelta(days=1))
        Lead.objects.filter(pk=recent.pk).update(created_at=now())

        assert find_lead_by_phone('593991000008') == exact

    def test_falls_back_to_the_most_recent_when_none_matches_exactly(self):
        """Sin coincidencia entera manda la fecha, y sólo la fecha.

        La consulta lleva el prefijo de marcación internacional (00593…), así que
        no coincide entera con ninguno de los dos. El más **viejo** es además el
        que más se le parece —sus dígitos son un sufijo de los de la consulta—,
        de modo que un desempate que se pase de listo lo elegiría a él. Sólo el
        fallback por fecha devuelve el más reciente.
        """
        older = Lead.objects.create(name='Viejo', phone='+593991000009')
        newer = Lead.objects.create(name='Nuevo', phone='0991000009')
        Lead.objects.filter(pk=older.pk).update(created_at=now() - timedelta(days=1))
        Lead.objects.filter(pk=newer.pk).update(created_at=now())

        assert find_lead_by_phone('00593991000009') == newer

    def test_ignores_soft_deleted_leads(self):
        lead = Lead.objects.create(name='Borrado', phone='0991000010')
        lead.soft_delete()

        assert find_lead_by_phone('593991000010') is None


class TestIsJelouBot:
    """The bot authenticates with a shared secret, and fails closed without one."""

    def _request(self, token=None):
        headers = {BOT_TOKEN_HEADER: token} if token is not None else {}
        return APIRequestFactory().get('/api/leads/bot/lookup/', headers=headers)

    @override_settings(JELOU_BOT_TOKEN=BOT_TOKEN)
    def test_grants_access_with_the_right_token(self):
        assert IsJelouBot().has_permission(self._request(BOT_TOKEN), None) is True

    @override_settings(JELOU_BOT_TOKEN=BOT_TOKEN)
    def test_denies_without_the_header(self):
        assert IsJelouBot().has_permission(self._request(), None) is False

    @override_settings(JELOU_BOT_TOKEN=BOT_TOKEN)
    def test_denies_with_a_wrong_token(self):
        assert IsJelouBot().has_permission(self._request('otro-secreto'), None) is False

    @override_settings(JELOU_BOT_TOKEN=BOT_TOKEN)
    def test_denies_with_an_empty_header(self):
        assert IsJelouBot().has_permission(self._request(''), None) is False

    @override_settings(JELOU_BOT_TOKEN=BOT_TOKEN)
    def test_denies_a_token_that_is_only_a_prefix(self):
        """Guards against a comparison that stops at the first shared bytes."""
        assert IsJelouBot().has_permission(self._request(BOT_TOKEN[:-1]), None) is False

    @override_settings(JELOU_BOT_TOKEN='')
    def test_denies_everything_when_the_secret_is_unset(self):
        """Fail-closed: a deployment missing the variable must not open the door."""
        assert IsJelouBot().has_permission(self._request(BOT_TOKEN), None) is False
        assert IsJelouBot().has_permission(self._request(), None) is False

    @override_settings(JELOU_BOT_TOKEN=BOT_TOKEN)
    def test_denies_a_non_ascii_token_without_raising(self):
        """Un byte no ASCII en la cabecera tiene que denegar, no reventar.

        `compare_digest` sobre `str` exige que ambos lados sean ASCII y lanza
        `TypeError` si no lo son. Django decodifica las cabeceras como latin-1
        (PEP 3333), así que un byte alto llega como `str` no ASCII: la excepción
        escapaba del permiso y las tres rutas respondían 500 sin credencial, en
        vez del 403 que el fail-closed promete.
        """
        assert IsJelouBot().has_permission(self._request('ñ' + BOT_TOKEN[1:]), None) is False


LOOKUP_URL = '/api/leads/bot/lookup/'
CREATE_URL = '/api/leads/bot/'


def by_phone_url(phone):
    return f'/api/leads/bot/by-phone/{phone}/'


@pytest.fixture
def bot_secret(settings):
    """Configure the shared secret.

    Las pruebas de rechazo también la usan: sin ella el permiso denegaría por
    fail-closed, y no se estaría probando lo que se cree (que falta la cabecera).
    """
    settings.JELOU_BOT_TOKEN = BOT_TOKEN
    return BOT_TOKEN


@pytest.fixture
def bot_client(bot_secret):
    """APIClient carrying the shared bot secret."""
    client = APIClient()
    client.credentials(HTTP_X_BOT_TOKEN=bot_secret)
    return client


@pytest.mark.django_db
class TestBotLeadLookup:
    """The lookup answers the four states the conversational flow branches on."""

    def test_reports_a_phone_with_no_lead_as_not_existing(self, bot_client):
        response = bot_client.get(LOOKUP_URL, {'phone': '593987654321'})

        assert response.status_code == 200, 'nunca 404: el flujo trata el error como lead nuevo'
        assert response.data == {'exists': False, 'status': '', 'owner': '', 'lead_id': ''}

    def test_reports_an_unassigned_lead_with_owner_as_empty_string(self, bot_client):
        """Un None aquí se interpola como texto y desvía a la rama de 'ya asignado'."""
        lead = Lead.objects.create(name='Sin Dueno', phone='0991000001')

        response = bot_client.get(LOOKUP_URL, {'phone': '593991000001'})

        assert response.status_code == 200
        assert response.data['exists'] is True
        assert response.data['owner'] == ''
        assert response.data['lead_id'] == str(lead.id)

    def test_reports_the_owner_full_name_when_the_lead_is_assigned(self, bot_client, assigned_lead):
        response = bot_client.get(LOOKUP_URL, {'phone': assigned_lead.phone})

        assert response.data['owner'] == assigned_lead.owner.get_full_name()

    def test_reports_the_converted_status(self, bot_client):
        Lead.objects.create(
            name='Recurrente', phone='0991000002', status=Lead.Status.CONVERTED,
        )

        response = bot_client.get(LOOKUP_URL, {'phone': '593991000002'})

        assert response.data['status'] == Lead.Status.CONVERTED

    def test_finds_a_local_lead_from_the_international_format(self, bot_client):
        """La normalización tiene que funcionar a través del endpoint, no solo suelta."""
        Lead.objects.create(name='Cruzado', phone='0991000003')

        assert bot_client.get(LOOKUP_URL, {'phone': '593991000003'}).data['exists'] is True

    def test_reports_not_existing_when_the_phone_is_missing(self, bot_client):
        response = bot_client.get(LOOKUP_URL)

        assert response.status_code == 200
        assert response.data['exists'] is False


@pytest.mark.django_db
class TestBotLeadCreate:
    """The bot registers the lead into the unassigned pool, without duplicating."""

    def test_creates_an_unassigned_whatsapp_lead(self, bot_client):
        response = bot_client.post(CREATE_URL, {
            'phone': '593991000004',
            'name': 'Nuevo Prospecto',
            'program': 'Data Science',
        }, format='json')

        assert response.status_code == 201
        assert response.data['created'] is True

        lead = Lead.objects.get(pk=response.data['lead_id'])
        assert lead.source == Lead.Source.WHATSAPP
        assert lead.status == Lead.Status.NEW
        assert lead.owner is None, 'tiene que caer al pool disponible'
        assert lead.program_interest == 'Data Science'

    def test_returns_the_existing_lead_instead_of_duplicating(self, bot_client):
        existing = Lead.objects.create(name='Ya Estaba', phone='0991000005')
        before = Lead.objects.count()

        response = bot_client.post(CREATE_URL, {
            'phone': '593991000005',
            'name': 'Ya Estaba',
            'program': 'Full Stack Development',
        }, format='json')

        assert response.status_code == 200
        assert response.data['created'] is False
        assert response.data['lead_id'] == str(existing.id)
        assert Lead.objects.count() == before, 'no debe crear un segundo lead'

    def test_resolves_the_program_fk_when_the_name_matches(self, bot_client, program):
        response = bot_client.post(CREATE_URL, {
            'phone': '593991000006',
            'name': 'Con Programa',
            'program': program.name,
        }, format='json')

        lead = Lead.objects.get(pk=response.data['lead_id'])
        assert lead.program == program

    def test_leaves_the_program_fk_empty_when_the_name_is_unknown(self, bot_client, program):
        response = bot_client.post(CREATE_URL, {
            'phone': '593991000007',
            'name': 'Programa Raro',
            'program': 'Un programa que no existe',
        }, format='json')

        lead = Lead.objects.get(pk=response.data['lead_id'])
        assert lead.program is None
        assert lead.program_interest == 'Un programa que no existe'

    def test_accepts_a_lead_without_program(self, bot_client):
        response = bot_client.post(CREATE_URL, {
            'phone': '593991000008', 'name': 'Sin Programa',
        }, format='json')

        assert response.status_code == 201
        assert Lead.objects.get(pk=response.data['lead_id']).program_interest == ''

    @pytest.mark.parametrize('payload', [
        {'name': 'Sin Telefono'},
        {'phone': '593991000009'},
        {'phone': '', 'name': 'Vacio'},
        {'phone': '593991000009', 'name': '   '},
    ])
    def test_rejects_a_payload_without_phone_or_name(self, bot_client, payload):
        assert bot_client.post(CREATE_URL, payload, format='json').status_code == 400


@pytest.mark.django_db(transaction=True)
class TestBotLeadCreateIsRaceFree:
    """El alta concurrente del mismo teléfono no puede dejar dos leads.

    Va aparte porque necesita ``transaction=True``: con la transacción envolvente
    de pytest-django los hilos no verían nada de lo que insertan los demás y el
    test pasaría con el defecto puesto. Es el caso real del bot, que reintenta por
    diseño y manda varias veces la misma conversación.
    """

    THREADS = 8

    def test_concurrent_creates_of_the_same_phone_leave_one_lead(self):
        from concurrent.futures import ThreadPoolExecutor

        from django.db import connection as db_connection

        from apps.leads.services import bot_create_lead

        def create():
            try:
                return bot_create_lead({'phone': '593991000099', 'name': 'Concurrente'})
            finally:
                # Cada hilo abre su propia conexión; sin cerrarla queda colgada y
                # el teardown de la base se bloquea.
                db_connection.close()

        try:
            with ThreadPoolExecutor(max_workers=self.THREADS) as pool:
                results = [future.result() for future in
                           [pool.submit(create) for _ in range(self.THREADS)]]

            leads = Lead.objects.filter(phone='593991000099')
            assert leads.count() == 1, (
                f'{leads.count()} leads para el mismo teléfono: el alta duplica bajo '
                f'concurrencia'
            )
            assert sum(1 for _, created in results if created) == 1, \
                'exactamente una petición debe reportar created=True'
        finally:
            Lead.all_objects.filter(phone='593991000099').delete()


@pytest.mark.django_db
class TestBotLeadUpdateByPhone:
    """The bot only knows the phone, so the update resolves the lead from it."""

    def test_applies_email_program_and_name(self, bot_client):
        lead = Lead.objects.create(name='Antes', phone='0991000010')

        response = bot_client.patch(by_phone_url('593991000010'), {
            'email': 'despues@example.com',
            'program': 'Data Analytics',
            'name': 'Despues',
        }, format='json')

        assert response.status_code == 200
        assert response.data['updated'] is True

        lead.refresh_from_db()
        assert lead.email == 'despues@example.com'
        assert lead.program_interest == 'Data Analytics'
        assert lead.name == 'Despues'

    def test_applies_only_the_fields_it_receives(self, bot_client):
        lead = Lead.objects.create(
            name='Intacto', phone='0991000011', program_interest='Full Stack',
        )

        bot_client.patch(
            by_phone_url('593991000011'), {'email': 'solo@example.com'}, format='json',
        )

        lead.refresh_from_db()
        assert lead.email == 'solo@example.com'
        assert lead.name == 'Intacto'
        assert lead.program_interest == 'Full Stack'

    def test_reports_not_updated_for_an_unknown_phone(self, bot_client):
        response = bot_client.patch(
            by_phone_url('593987654321'), {'email': 'nadie@example.com'}, format='json',
        )

        assert response.status_code == 200, 'nunca 404: cortaría el cierre de la conversación'
        assert response.data == {'updated': False, 'lead_id': '', 'lead': None}

    def test_resolves_the_program_fk_on_update(self, bot_client, program):
        Lead.objects.create(name='Sin FK', phone='0991000012')

        bot_client.patch(
            by_phone_url('593991000012'), {'program': program.name}, format='json',
        )

        assert Lead.objects.get(phone='0991000012').program == program

    def test_refuses_to_touch_a_converted_lead(self, bot_client):
        """Detrás de un lead convertido hay un bootcamper con matrícula y pagos.

        Su correo es el canal de las notificaciones de cobro y del onboarding: si
        el bot puede reescribirlo, cualquiera que conozca el teléfono le desvía
        esos avisos.
        """
        lead = Lead.objects.create(
            name='Bootcamper Real', phone='0991000013',
            email='real@espol.edu.ec', status=Lead.Status.CONVERTED,
        )

        response = bot_client.patch(by_phone_url('593991000013'), {
            'name': 'Pisado Por El Bot',
            'email': 'otro@example.com',
        }, format='json')

        assert response.status_code == 200
        assert response.data['updated'] is False

        lead.refresh_from_db()
        assert lead.name == 'Bootcamper Real'
        assert lead.email == 'real@espol.edu.ec'
        assert lead.status == Lead.Status.CONVERTED

    @pytest.mark.parametrize('status_value', [
        Lead.Status.NEW,
        Lead.Status.QUALIFIED,
        Lead.Status.INTERESTED,
        Lead.Status.NOT_INTERESTED,
        Lead.Status.DISCARDED,
    ])
    def test_still_updates_every_non_converted_status(self, bot_client, status_value):
        """Sólo CONVERTED queda fuera: un descartado que vuelve a escribir se recapta."""
        lead = Lead.objects.create(
            name='Antes', phone='0991000014', status=status_value,
        )

        response = bot_client.patch(
            by_phone_url('593991000014'), {'name': 'Despues'}, format='json',
        )

        assert response.data['updated'] is True
        lead.refresh_from_db()
        assert lead.name == 'Despues'


@pytest.mark.django_db
@pytest.mark.usefixtures('bot_secret')
class TestBotEndpointsRequireTheSecret:
    """RBAC obligatorio: las tres rutas se cierran sin la cabecera."""

    def test_lookup_is_closed(self):
        assert APIClient().get(LOOKUP_URL, {'phone': '593991000001'}).status_code == 403

    def test_create_is_closed(self):
        response = APIClient().post(
            CREATE_URL, {'phone': '593991000001', 'name': 'X'}, format='json',
        )

        assert response.status_code == 403
        assert not Lead.objects.exists(), 'un rechazo no puede dejar rastro'

    def test_update_is_closed(self):
        response = APIClient().patch(
            by_phone_url('593991000001'), {'email': 'x@example.com'}, format='json',
        )

        assert response.status_code == 403

    def test_a_wrong_secret_is_also_closed(self):
        client = APIClient()
        client.credentials(HTTP_X_BOT_TOKEN='otro-secreto')

        assert client.get(LOOKUP_URL, {'phone': '593991000001'}).status_code == 403

    def test_a_non_ascii_secret_is_closed_and_not_a_500(self):
        """El rechazo tiene que ser 403 también con un byte alto en la cabecera.

        Es la comprobación de extremo a extremo del arreglo de `compare_digest`:
        antes la excepción escapaba del permiso y la ruta devolvía 500 sin
        credencial, que además es un 500 provocable por cualquiera.
        """
        client = APIClient()
        client.credentials(HTTP_X_BOT_TOKEN='ñ-secreto-invalido')

        assert client.get(LOOKUP_URL, {'phone': '593991000001'}).status_code == 403
