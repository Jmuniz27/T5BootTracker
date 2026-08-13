"""Permission class for the WhatsApp bot integration surface (#278).

El resto de la app autentica personas con JWT y decide por rol
(`apps.leads.permissions`). El bot no es una persona: es un workflow sin estado
que no puede sostener un access token de 2 horas con refresh rotativo, y que
además chocaría con el límite de 5 logins/min del endpoint de sesión. Se
autentica con un secreto compartido en cabecera, y no opera en nombre de ningún
usuario — los leads que crea entran al pool sin vendedor asignado.
"""
import logging
import secrets

from django.conf import settings
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)

BOT_TOKEN_HEADER = 'X-Bot-Token'


class IsJelouBot(BasePermission):
    """Allow only requests carrying the shared bot secret.

    Fail-closed: with ``JELOU_BOT_TOKEN`` unset the answer is always no, so a
    deployment missing the variable breaks the integration instead of leaving
    the endpoints open to anyone.
    """

    message = 'Credencial de integración inválida.'

    def has_permission(self, request, view):
        expected = settings.JELOU_BOT_TOKEN
        if not expected:
            logger.error(
                'JELOU_BOT_TOKEN sin configurar: se rechaza el acceso del bot a %s',
                request.path,
            )
            return False

        provided = request.headers.get(BOT_TOKEN_HEADER, '')
        if not provided:
            return False

        # compare_digest y no ==: la comparación de un secreto no debe cortarse
        # en el primer byte distinto.
        #
        # Se comparan bytes y no str: sobre str, compare_digest exige que ambos
        # lados sean ASCII y lanza TypeError si no. Django decodifica las
        # cabeceras como latin-1 (PEP 3333), así que un byte alto en X-Bot-Token
        # llegaba como str no ASCII, la excepción escapaba de aquí y la ruta
        # respondía 500 sin credencial en vez del 403 que promete el fail-closed.
        return secrets.compare_digest(provided.encode('utf-8'), expected.encode('utf-8'))
