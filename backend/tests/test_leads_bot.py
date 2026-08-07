"""Tests for the WhatsApp bot integration surface of the leads app."""
from datetime import timedelta

import pytest
from django.utils.timezone import now

from apps.leads.models import Lead
from apps.leads.services import find_lead_by_phone, normalize_phone


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
