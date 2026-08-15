"""Tests for the WhatsApp bot catalog of the programs app (CB-84).

Lo que se protege aquí es que la lista que el bot pinta en WhatsApp sea el
catálogo del CRM y quepa en los topes de Meta. Un `label` de más de 24
caracteres no se recorta solo: Meta rechaza el mensaje entero y la conversación
se queda muda, que es un fallo invisible desde el backend.
"""
from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.programs.models import Program
from apps.programs.services import BOT_CATALOG_LIMIT, BOT_LABEL_MAX, bot_program_catalog

BOT_TOKEN = 'un-secreto-de-prueba-suficientemente-largo'
CATALOG_URL = '/api/programs/bot/'


@pytest.fixture
def bot_secret(settings):
    settings.JELOU_BOT_TOKEN = BOT_TOKEN
    return BOT_TOKEN


@pytest.fixture
def bot_client(bot_secret):
    client = APIClient()
    client.credentials(HTTP_X_BOT_TOKEN=bot_secret)
    return client


def make_program(name, *, active=True, start=date(2026, 5, 15)):
    return Program.objects.create(
        name=name,
        start_date=start,
        end_date=date(start.year + 1, start.month, start.day),
        total_cost='1500.00',
        is_active=active,
    )


@pytest.mark.django_db
class TestBotProgramCatalogAccess:
    """La misma credencial compartida que el resto de la superficie del bot."""

    def test_rejects_a_request_without_the_header(self, bot_secret):
        assert APIClient().get(CATALOG_URL).status_code == 403

    def test_rejects_a_request_with_a_wrong_token(self, bot_secret):
        client = APIClient()
        client.credentials(HTTP_X_BOT_TOKEN='otro-secreto')

        assert client.get(CATALOG_URL).status_code == 403

    def test_rejects_everything_when_the_secret_is_unset(self, settings):
        """Fail-closed: sin la variable el catálogo no queda público."""
        settings.JELOU_BOT_TOKEN = ''
        client = APIClient()
        client.credentials(HTTP_X_BOT_TOKEN=BOT_TOKEN)

        assert client.get(CATALOG_URL).status_code == 403

    def test_accepts_the_shared_secret(self, bot_client):
        assert bot_client.get(CATALOG_URL).status_code == 200

    def test_bot_route_is_not_read_as_a_program_id(self, bot_client):
        """`bot/` va antes que `<uuid:pk>/`; si se invirtiera, esto daría 404."""
        assert bot_client.get(CATALOG_URL).status_code == 200


@pytest.mark.django_db
class TestBotProgramCatalogContent:
    """Qué programas entran en la lista y en qué orden."""

    def test_returns_an_empty_list_when_there_are_no_programs(self, bot_client):
        """200 con lista vacía, no 404: el flujo ramifica sobre el contenido."""
        response = bot_client.get(CATALOG_URL)

        assert response.status_code == 200
        assert response.json() == []

    def test_excludes_inactive_programs(self, bot_client):
        make_program('Data Science Junio 2026')
        make_program('Bootcamp Cerrado', active=False)

        names = [item['name'] for item in bot_client.get(CATALOG_URL).json()]

        assert names == ['Data Science Junio 2026'], 'un programa cerrado no se puede vender'

    def test_lists_the_most_recent_first(self, bot_client):
        make_program('Viejo', start=date(2025, 1, 10))
        make_program('Nuevo', start=date(2026, 9, 1))
        make_program('Intermedio', start=date(2026, 3, 5))

        names = [item['name'] for item in bot_client.get(CATALOG_URL).json()]

        assert names == ['Nuevo', 'Intermedio', 'Viejo']

    def test_caps_the_list_at_the_whatsapp_row_limit(self, bot_client):
        """Con 12 activos salen 10: mandar más hace que Meta rechace el mensaje."""
        for i in range(BOT_CATALOG_LIMIT + 2):
            make_program(f'Programa {i}', start=date(2026, 1, 1 + i))

        catalog = bot_client.get(CATALOG_URL).json()

        assert len(catalog) == BOT_CATALOG_LIMIT
        assert catalog[0]['name'] == f'Programa {BOT_CATALOG_LIMIT + 1}', 'se quedan los más recientes'

    def test_exposes_the_id_so_the_lead_links_by_id(self, bot_client):
        program = make_program('Data Science Junio 2026')

        assert bot_client.get(CATALOG_URL).json()[0]['id'] == str(program.id)


@pytest.mark.django_db
class TestBotProgramCatalogLabels:
    """El recorte a los topes de Meta, que es la razón de que exista `label`."""

    def test_keeps_a_short_name_whole_and_describes_the_start_date(self, bot_client):
        make_program('Data Science Junio 2026', start=date(2026, 7, 14))

        item = bot_client.get(CATALOG_URL).json()[0]

        assert item['label'] == 'Data Science Junio 2026'
        assert item['description'] == 'Inicia 14 jul 2026'

    def test_cuts_a_long_name_on_a_word_and_keeps_the_full_one_in_the_description(self, bot_client):
        make_program('Python Full Stack Abril 2026')

        item = bot_client.get(CATALOG_URL).json()

        assert item[0]['label'] == 'Python Full Stack Abril', 'corta por palabra, no a mitad'
        assert item[0]['description'] == 'Python Full Stack Abril 2026', 'no se pierde el nombre'

    @pytest.mark.parametrize('name', [
        'Python Full Stack Abril 2026',
        'Desarrollo Web Full Stack con React y Django 2026',
        'Superprogramadeunasolapalabralarguisimasinespacios',
    ])
    def test_no_label_exceeds_the_row_title_limit(self, bot_client, name):
        make_program(name)

        assert len(bot_client.get(CATALOG_URL).json()[0]['label']) <= BOT_LABEL_MAX

    def test_cuts_a_single_long_word_even_without_a_space(self):
        """Sin espacios no hay dónde cortar por palabra; se corta igual."""
        make_program('Superprogramadeunasolapalabralarguisima')

        item = bot_program_catalog()[0]

        assert item['label'] == 'Superprogramadeunasolapa'
        assert len(item['label']) <= BOT_LABEL_MAX

    def test_no_description_exceeds_the_row_description_limit(self):
        make_program('Desarrollo Web Full Stack con React, Django y Postgres — edición 2026')

        assert len(bot_program_catalog()[0]['description']) <= 72
