"""Consentimiento de uso de datos al activar la cuenta (#329).

Lo levantó el equipo en la demo ("si no, tendría el tema de la protección de
datos") y la clienta definió dónde va: "cuando él crea su cuenta, decir que al
crear su cuenta acepta que su información será utilizada para los fines internos
de seguimiento de Coding Bootcamps".
"""
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.authentication.models import CustomUser
from apps.authentication.services import (
    DATA_CONSENT_VERSION, make_onboarding_token,
)


@pytest.fixture
def invitado(db):
    """Bootcamper con invitación pendiente, sin activar."""
    user = CustomUser.objects.create_user(
        email='invitado@test.com', password=None,
        first_name='Ana', last_name='Torres', role=CustomUser.Role.BOOTCAMPER,
    )
    user.set_unusable_password()
    user.is_active = False
    # El token sólo sirve mientras la cuenta esté INVITED; con cualquier otro
    # estado el endpoint responde ALREADY_ACTIVATED.
    user.verification_status = CustomUser.VerificationStatus.INVITED
    user.save(update_fields=['password', 'is_active', 'verification_status'])
    return user


def activar(user, datos):
    # El endpoint comparte el scope 'auth' (5/min): sin limpiar, el tope tumba
    # los tests que corren seguidos.
    cache.clear()
    return APIClient().post(f'/api/auth/onboarding/{make_onboarding_token(user)}/activate/', datos, format='json')


def payload(**extra):
    base = {
        'password': 'unaClaveLarga123',
        'password_confirm': 'unaClaveLarga123',
        'data_consent': True,
    }
    base.update(extra)
    return base


class TestDataConsent:
    def test_activar_sella_el_consentimiento(self, db, invitado):
        resp = activar(invitado, payload())

        assert resp.status_code == 200, resp.json()
        invitado.refresh_from_db()
        assert invitado.data_consent_at is not None
        assert invitado.data_consent_version == DATA_CONSENT_VERSION

    def test_sin_aceptar_no_se_activa_la_cuenta(self, db, invitado):
        resp = activar(invitado, payload(data_consent=False))

        assert resp.status_code == 400
        invitado.refresh_from_db()
        assert invitado.data_consent_at is None
        assert invitado.onboarding_completed_at is None

    def test_omitir_el_campo_no_equivale_a_aceptarlo(self, db, invitado):
        # Sin default: un cliente viejo que no lo mande no puede pasar de largo.
        datos = payload()
        del datos['data_consent']

        resp = activar(invitado, datos)

        assert resp.status_code == 400
        invitado.refresh_from_db()
        assert invitado.data_consent_at is None

    def test_una_cuenta_nueva_arranca_sin_consentimiento(self, db, invitado):
        # Las cuentas anteriores a esto quedan en nulo, no marcadas como si
        # hubieran aceptado algo que nunca vieron.
        assert invitado.data_consent_at is None
        assert invitado.data_consent_version == ''

    def test_el_rechazo_no_deja_la_contrasena_cambiada(self, db, invitado):
        activar(invitado, payload(data_consent=False))

        invitado.refresh_from_db()
        assert not invitado.check_password('unaClaveLarga123')
