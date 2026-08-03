"""Prepara el entorno desplegado para la demostración.

Hace tres cosas:

1. Carga el catálogo de datos llamando a `seed_dev`, para no duplicarlo.
2. Crea las cuentas nominales del equipo (ver `TEAM_ACCOUNTS`) repartidas entre
   los roles que tienen pantallas propias, y registra al coordinador como
   destinatario de correo en todos los programas.
3. **Rota todas las contraseñas** a valores generados al azar. Ese es el motivo
   principal de que este comando exista: `seed_dev` fija contraseñas escritas en
   el repositorio (`admin1234`, `vendedor1234`…), y dejarlas en un servidor
   accesible desde internet equivale a publicar las credenciales de
   administrador.

Las contraseñas se imprimen **una sola vez** por stdout y no se guardan en
ningún lado: Django solo persiste el hash. Hay que copiarlas al ejecutarlo.

    docker compose -p boottracker -f docker-compose.hetzner.yml \
        exec backend python manage.py seed_demo
"""
import secrets

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

# Cuentas que crea seed_dev, con el rol que le toca a cada una en la demo.
DEMO_ACCOUNTS = [
    ('admin@boottracker.com', 'ADMINISTRATOR — acceso total + Django admin'),
    ('vendedor1@boottracker.com', 'SALESPERSON — tiene leads asignados'),
    ('vendedor2@boottracker.com', 'SALESPERSON — sin leads, para probar asignación'),
    ('bootcamper@boottracker.com', 'BOOTCAMPER — con pagos aprobado y pendiente'),
    ('bootcamper.conv@boottracker.com', 'BOOTCAMPER — convertido desde un lead'),
]

# Cuentas nominales del equipo.
#
# Solo se reparten los tres roles que tienen pantallas propias: ADMINISTRATOR,
# SALESPERSON y BOOTCAMPER. COORDINATOR y FINANCE existen en CustomUser.Role y
# tienen su clase en apps/authentication/permissions.py, pero ninguna vista los
# usa todavia, asi que una cuenta con esos roles no podria ejercitar ningun
# flujo. El coordinador, ademas, no es un usuario de la app: es un destinatario
# de correo y se configura en CoordinatorEmailConfig (ver COORDINATOR_EMAIL).
TEAM_ACCOUNTS = [
    ('juanmuni@espol.edu.ec', 'Juan', 'Munizaga', 'ADMINISTRATOR',
     'acceso total + Django admin'),
    ('iimartin@espol.edu.ec', 'Isabella', 'Martín', 'ADMINISTRATOR',
     'acceso total + Django admin'),
    ('ansaguzm@espol.edu.ec', 'Annabella', 'Sánchez', 'SALESPERSON',
     'gestiona leads y valida pagos'),
    ('zdiaz@espol.edu.ec', 'Zahid', 'Díaz', 'SALESPERSON',
     'arranca sin leads: sirve para probar la auto-asignación'),
    ('jlchong@espol.edu.ec', 'José Luis', 'Chong', 'SALESPERSON',
     'segundo vendedor, para reasignación y liberación de leads'),
    ('gabdejim@espol.edu.ec', 'Gabriela', 'De Jesús', 'BOOTCAMPER',
     've sus pagos y sube comprobantes'),
]

# Destinataria de los correos de coordinacion. No es una cuenta de la app.
#
# Sin al menos un registro en CoordinatorEmailConfig, send_conversion_notification
# y send_late_payment_alert hacen return temprano con un logger.warning y no
# mandan nada: en la demo se ve como "el correo no llega", sin causa aparente.
COORDINATOR_EMAIL = 'gabdejim@espol.edu.ec'
COORDINATOR_NAME = 'Gabriela De Jesús'

# 3 palabras de ~4 caracteres hex separadas por guion: entropia mas que
# suficiente y todavia se puede dictar en voz alta durante la demo.
PASSWORD_WORDS = 3
PASSWORD_WORD_BYTES = 2


def generate_password():
    return '-'.join(
        secrets.token_hex(PASSWORD_WORD_BYTES) for _ in range(PASSWORD_WORDS)
    )


class Command(BaseCommand):
    help = (
        'Carga los datos de demo y rota las contrasenas de seed_dev por unas '
        'aleatorias, que se imprimen una unica vez.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--keep-passwords',
            action='store_true',
            help=(
                'NO rotar las contrasenas: deja las publicadas en el repo. '
                'Solo para entornos locales desechables.'
            ),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # --force porque el entorno desplegado corre con DEBUG=False y el guard
        # de seed_dev lo bloquearia. Es seguro precisamente porque acto seguido
        # se rotan las contrasenas que ese guard protege.
        self.stdout.write('Cargando datos de demo (via seed_dev)...')
        call_command('seed_dev', force=True, verbosity=0)
        self.stdout.write(self.style.SUCCESS('  Datos cargados.'))

        if options['keep_passwords']:
            self.stdout.write(self.style.WARNING(
                '\n  --keep-passwords: las contrasenas siguen siendo las del '
                'repositorio. NO usar asi en un servidor publico.'
            ))
            return

        User = get_user_model()

        # Cuentas nominales del equipo.
        self.stdout.write('\nCreando cuentas del equipo...')
        team = []
        for email, first, last, role, description in TEAM_ACCOUNTS:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={'first_name': first, 'last_name': last, 'role': role},
            )
            # El rol se reafirma en cada corrida: si alguien lo cambio probando,
            # el seed vuelve a dejar el reparto documentado aca.
            user.role = role
            user.first_name = first
            user.last_name = last
            # is_staff es lo que habilita el Django admin; sin esto un
            # ADMINISTRATOR entra a la app pero no a /admin/.
            user.is_staff = role == 'ADMINISTRATOR'
            password = generate_password()
            user.set_password(password)
            user.save()
            team.append((email, password, f'{role} — {description}'))
            self.stdout.write(f'  {"creado" if created else "actualizado"}: {email}')

        self._ensure_coordinator_email()

        self.stdout.write('\nRotando contrasenas de las cuentas de prueba...')
        rotated = []
        for email, description in DEMO_ACCOUNTS:
            user = User.objects.filter(email=email).first()
            if user is None:
                self.stdout.write(self.style.WARNING(f'  {email}: no existe, se omite'))
                continue
            password = generate_password()
            user.set_password(password)
            user.save(update_fields=['password'])
            rotated.append((email, password, description))

        rotated = team + rotated

        self.stdout.write(self.style.SUCCESS(f'  {len(rotated)} cuentas rotadas.\n'))
        self.stdout.write(self.style.WARNING(
            '=' * 78 + '\n'
            '  ESTAS CONTRASENAS SE MUESTRAN UNA SOLA VEZ. Copialas ahora.\n'
            '  No quedan guardadas: la base solo almacena el hash.\n'
            + '=' * 78
        ))
        for email, password, description in rotated:
            self.stdout.write(f'\n  {email}\n    clave: {password}\n    rol:   {description}')

        self.stdout.write(
            '\n\n  Las cuentas ADMINISTRATOR ya entran al Django admin (is_staff). '
            'Un superusuario\n  aparte solo hace falta para gestionar permisos '
            'de Django.\n'
        )

    def _ensure_coordinator_email(self):
        """Registra al coordinador como destinatario en todos los programas."""
        from apps.programs.models import CoordinatorEmailConfig, Program

        programs = Program.objects.all()
        if not programs:
            self.stdout.write(self.style.WARNING(
                '\n  No hay programas: no se configuro ningun coordinador.'
            ))
            return

        for program in programs:
            CoordinatorEmailConfig.objects.get_or_create(
                program=program,
                email=COORDINATOR_EMAIL,
                defaults={'name': COORDINATOR_NAME, 'recipient_type': 'TO'},
            )
        self.stdout.write(self.style.SUCCESS(
            f'\n  Coordinador {COORDINATOR_EMAIL} configurado en '
            f'{len(programs)} programa(s).'
        ))
