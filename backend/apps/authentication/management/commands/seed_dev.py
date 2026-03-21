"""Management command to populate dev database with sample data."""
import random
from django.core.management.base import BaseCommand
from django.utils.timezone import now, timedelta
from apps.authentication.models import CustomUser
from apps.leads.models import Lead, Interaction


SOURCES = [
    Lead.Source.INSTAGRAM,
    Lead.Source.WHATSAPP,
    Lead.Source.LANDING_PAGE,
    Lead.Source.MANUAL,
]

STATUSES = [
    Lead.Status.NEW,
    Lead.Status.CONTACTED,
    Lead.Status.INTERESTED,
    Lead.Status.NOT_INTERESTED,
]

PROGRAMS = [
    'Desarrollo Web Full Stack',
    'Data Science',
    'UX/UI Design',
    'Ciberseguridad',
    'DevOps',
]

LEADS_DATA = [
    {'name': 'Ana Torres',       'phone': '0991000001', 'email': 'ana@test.com',       'source': Lead.Source.INSTAGRAM,    'is_company': False},
    {'name': 'Carlos Mendoza',   'phone': '0991000002', 'email': 'carlos@test.com',    'source': Lead.Source.WHATSAPP,     'is_company': False},
    {'name': 'Tech Corp S.A.',   'phone': '0991000003', 'email': 'tech@corp.com',      'source': Lead.Source.LANDING_PAGE, 'is_company': True},
    {'name': 'María Vélez',      'phone': '0991000004', 'email': None,                 'source': Lead.Source.MANUAL,       'is_company': False},
    {'name': 'Roberto Paredes',  'phone': '0991000005', 'email': 'rp@gmail.com',       'source': Lead.Source.INSTAGRAM,    'is_company': False},
    {'name': 'Innovatech Cía.',  'phone': '0991000006', 'email': 'info@innova.com',    'source': Lead.Source.LANDING_PAGE, 'is_company': True},
    {'name': 'Lucía Ramírez',    'phone': '0991000007', 'email': None,                 'source': Lead.Source.WHATSAPP,     'is_company': False},
    {'name': 'Pedro Guerrero',   'phone': '0991000008', 'email': 'pedro@test.com',     'source': Lead.Source.MANUAL,       'is_company': False},
    {'name': 'Sofía Castillo',   'phone': '0991000009', 'email': 'sofia@test.com',     'source': Lead.Source.INSTAGRAM,    'is_company': False},
    {'name': 'Juan Espinoza',    'phone': '0991000010', 'email': 'juan@test.com',      'source': Lead.Source.WHATSAPP,     'is_company': False},
]


class Command(BaseCommand):
    help = 'Populate the database with sample development data.'

    def handle(self, *args, **options):
        self.stdout.write('Seeding development data...')

        # Users
        admin, _ = CustomUser.objects.get_or_create(
            email='admin@boottracker.com',
            defaults={'first_name': 'Admin', 'last_name': 'Sistema', 'role': CustomUser.Role.ADMINISTRATOR, 'is_staff': True},
        )
        admin.set_password('admin1234')
        admin.save()

        v1, _ = CustomUser.objects.get_or_create(
            email='vendedor1@boottracker.com',
            defaults={'first_name': 'Vendedor', 'last_name': 'Uno', 'role': CustomUser.Role.SALESPERSON},
        )
        v1.set_password('vendedor1234')
        v1.save()

        v2, _ = CustomUser.objects.get_or_create(
            email='vendedor2@boottracker.com',
            defaults={'first_name': 'Vendedor', 'last_name': 'Dos', 'role': CustomUser.Role.SALESPERSON},
        )
        v2.set_password('vendedor1234')
        v2.save()

        bootcamper, _ = CustomUser.objects.get_or_create(
            email='bootcamper@boottracker.com',
            defaults={'first_name': 'Boot', 'last_name': 'Camper', 'role': CustomUser.Role.BOOTCAMPER},
        )
        bootcamper.set_password('boot1234')
        bootcamper.save()

        self.stdout.write(self.style.SUCCESS('  Users created/updated.'))

        # Leads
        statuses = STATUSES * 3  # cycle
        for i, data in enumerate(LEADS_DATA):
            lead, _ = Lead.objects.get_or_create(
                phone=data['phone'],
                defaults={
                    'name': data['name'],
                    'email': data['email'],
                    'source': data['source'],
                    'is_company': data['is_company'],
                    'program_interest': random.choice(PROGRAMS),
                    'status': statuses[i],
                },
            )
            # Assign first 5 leads to vendedor1
            if i < 5 and lead.owner is None:
                lead.owner       = v1
                lead.assigned_at = now() - timedelta(days=random.randint(1, 10))
                lead.save()

        self.stdout.write(self.style.SUCCESS('  Leads created/updated.'))

        # Interactions for vendedor1's leads
        v1_leads = Lead.objects.filter(owner=v1)[:3]
        outcomes = [
            Interaction.Outcome.INTERESTED,
            Interaction.Outcome.CALLBACK,
            Interaction.Outcome.NOT_INTERESTED,
        ]
        for lead, outcome in zip(v1_leads, outcomes):
            if not lead.interactions.exists():
                Interaction.objects.create(
                    lead=lead,
                    salesperson=v1,
                    interaction_type=Interaction.InteractionType.CALL,
                    outcome=outcome,
                    interest_level=random.randint(1, 5),
                    notes='Contacto inicial de prueba.',
                )

        self.stdout.write(self.style.SUCCESS('  Interactions created.'))
        self.stdout.write(self.style.SUCCESS('\nDev seed complete!'))
        self.stdout.write('  admin@boottracker.com       / admin1234')
        self.stdout.write('  vendedor1@boottracker.com   / vendedor1234')
        self.stdout.write('  vendedor2@boottracker.com   / vendedor1234')
        self.stdout.write('  bootcamper@boottracker.com  / boot1234')
