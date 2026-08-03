"""Pruebas del endpoint de salud."""
import pytest
from rest_framework.test import APIClient

HEALTH_URL = '/health/'


@pytest.mark.django_db
class TestHealth:
    def test_health_responde_sin_autenticacion(self):
        """Lo consultan Docker y el proxy, que no tienen credenciales."""
        resp = APIClient().get(HEALTH_URL)
        assert resp.status_code == 200
        assert resp.json() == {'status': 'healthy', 'database': 'up'}

    def test_health_no_expone_detalles_del_sistema(self):
        """La respuesta es pública: no debe filtrar versiones ni configuración."""
        cuerpo = APIClient().get(HEALTH_URL).json()
        assert set(cuerpo.keys()) == {'status', 'database'}

    def test_health_rechaza_metodos_distintos_de_get(self):
        resp = APIClient().post(HEALTH_URL, {}, format='json')
        assert resp.status_code == 405
