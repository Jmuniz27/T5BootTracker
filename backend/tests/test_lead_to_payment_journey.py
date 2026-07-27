"""Cross-app backend integration test (CB-100 / S5-3): a single continuous
request chain spanning leads -> programs -> payments -> analytics, instead of
testing each app's endpoints in isolation (as every other test file does).
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Interaction, Lead
from apps.programs.models import Enrollment, Program

LEADS_URL = '/api/leads/'
UPLOAD_URL = '/api/payments/upload/'
CONFIRM_URL = '/api/payments/my-payments/{id}/confirm/'
APPROVE_URL = '/api/payments/{id}/approve/'
RETURNING_BOOTCAMPER_URL = '/api/leads/returning-bootcamper/'
ANALYTICS_KPIS_URL = '/api/analytics/kpis/'

VALID_CEDULA = '1713175071'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def _upload_and_approve_payment(bootcamper, program, admin_user, program_amount):
    """Uploads a receipt as the bootcamper, confirms it, and approves it as admin.

    Returns the created Payment id. Mocks the two Celery side-effects
    (OCR + status notification), same convention as test_payments.py.
    """
    from apps.payments.models import Payment

    bootcamper_client = make_client(bootcamper)
    fake_file = SimpleUploadedFile('receipt.jpg', b'fake-image-data', content_type='image/jpeg')
    with patch('apps.payments.tasks.process_payment_ocr.delay'):
        upload_resp = bootcamper_client.post(
            UPLOAD_URL, {'receipt_file': fake_file, 'program_id': str(program.id)}, format='multipart',
        )
    assert upload_resp.status_code == 201
    payment_id = upload_resp.json()['id']

    confirm_resp = bootcamper_client.patch(CONFIRM_URL.format(id=payment_id), {}, format='json')
    assert confirm_resp.status_code == 200
    assert Payment.objects.get(pk=payment_id).status == Payment.Status.PENDING

    admin_client = make_client(admin_user)
    with patch('apps.payments.tasks.send_payment_status_notification.delay'):
        approve_resp = admin_client.patch(APPROVE_URL.format(id=payment_id), {
            'confirmed_amount': str(program_amount),
            'confirmed_bank_name': 'Banco Pichincha',
            'confirmed_transaction_id': 'TXN-JOURNEY-1',
        }, format='json')
    assert approve_resp.status_code == 200
    return payment_id


class TestLeadToPaymentJourney:
    def test_full_journey_lead_to_approved_payment_reflected_in_analytics(
        self, db, salesperson_user, admin_user, program,
    ):
        salesperson_client = make_client(salesperson_user)

        # 1. Crear el lead (flujo manual, CR-001)
        create_resp = salesperson_client.post(LEADS_URL, {
            'name': 'Ana Journey', 'phone': '0991112233', 'source': Lead.Source.MANUAL,
        }, format='json')
        assert create_resp.status_code == 201
        lead_id = create_resp.json()['id']

        # 2. El vendedor se autoasigna
        assign_resp = salesperson_client.patch(f'{LEADS_URL}{lead_id}/assign/')
        assert assign_resp.status_code == 200
        assert assign_resp.json()['owner'] == str(salesperson_user.id)

        # 3. Registra una interacción que califica al lead (SCHEDULE_VISIT -> QUALIFIED)
        interaction_resp = salesperson_client.post(f'{LEADS_URL}{lead_id}/interactions/', {
            'interaction_type': Interaction.InteractionType.VISIT,
            'outcome': Interaction.Outcome.SCHEDULE_VISIT,
        }, format='json')
        assert interaction_resp.status_code == 201
        assert Lead.objects.get(pk=lead_id).status == Lead.Status.QUALIFIED

        # 4. Convierte el lead a bootcamper (crea CustomUser + Enrollment)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'):
            convert_resp = salesperson_client.post(f'{LEADS_URL}{lead_id}/convert/', {
                'cedula': VALID_CEDULA,
                'program_id': str(program.id),
                'email': 'ana.journey@test.com',
            }, format='json')
        assert convert_resp.status_code == 201
        bootcamper_id = convert_resp.json()['bootcamper_id']

        lead = Lead.objects.get(pk=lead_id)
        assert lead.status == Lead.Status.CONVERTED
        bootcamper = CustomUser.objects.get(pk=bootcamper_id)
        enrollment = Enrollment.objects.get(bootcamper=bootcamper, bootcamp=program)
        assert enrollment.agreed_price == program.total_cost

        # 5. Sube y aprueba el comprobante de pago
        _upload_and_approve_payment(bootcamper, program, admin_user, program.total_cost)

        # 6. El cierre cruzado: los KPIs de analytics (CB-55) reflejan exactamente
        # lo que acaba de pasar en los pasos 1-5, confirmando que el flujo atravesó
        # leads + programs + payments + analytics de forma consistente.
        admin_client = make_client(admin_user)
        kpi_resp = admin_client.get(ANALYTICS_KPIS_URL)
        assert kpi_resp.status_code == 200
        kpis = kpi_resp.json()

        assert kpis['conversion_rate']['total_leads'] == 1
        assert kpis['conversion_rate']['converted_leads'] == 1
        assert kpis['conversion_rate']['rate_percentage'] == 100.0

        payment_row = next(
            p for p in kpis['payment_collection']['by_program'] if p['program_id'] == str(program.id)
        )
        assert payment_row['expected_amount'] == float(program.total_cost)
        assert payment_row['collected_amount'] == float(program.total_cost)
        assert payment_row['collection_rate_percentage'] == 100.0
        assert payment_row['is_critical'] is False

    def test_returning_bootcamper_second_enrollment_chains_correctly(
        self, db, salesperson_user, admin_user, program,
    ):
        """A second, independent cycle for the same bootcamper (ReturningBootcamperView),
        re-running the same cross-app chain to confirm it holds up on repeat, not just once.
        """
        salesperson_client = make_client(salesperson_user)

        create_resp = salesperson_client.post(LEADS_URL, {
            'name': 'Carlos Journey', 'phone': '0993334455', 'source': Lead.Source.MANUAL,
        }, format='json')
        lead_id = create_resp.json()['id']
        salesperson_client.patch(f'{LEADS_URL}{lead_id}/assign/')
        salesperson_client.post(f'{LEADS_URL}{lead_id}/interactions/', {
            'interaction_type': Interaction.InteractionType.VISIT,
            'outcome': Interaction.Outcome.SCHEDULE_VISIT,
        }, format='json')
        with patch('apps.notifications.tasks.send_conversion_notification.delay'):
            convert_resp = salesperson_client.post(f'{LEADS_URL}{lead_id}/convert/', {
                'cedula': VALID_CEDULA,
                'program_id': str(program.id),
                'email': 'carlos.journey@test.com',
            }, format='json')
        assert convert_resp.status_code == 201
        bootcamper = CustomUser.objects.get(pk=convert_resp.json()['bootcamper_id'])

        # El mismo bootcamper vuelve a inscribirse en otro programa (S2-4/ReturningBootcamperView)
        second_program = Program.objects.create(
            name='Data Science Julio 2026',
            start_date=date.today() + timedelta(days=5),
            end_date=date.today() + timedelta(days=95),
            total_cost=Decimal('900.00'),
        )
        returning_resp = salesperson_client.post(RETURNING_BOOTCAMPER_URL, {
            'bootcamper_email': bootcamper.email,
            'program_id': str(second_program.id),
        }, format='json')
        assert returning_resp.status_code == 201
        assert returning_resp.json()['id'] != lead_id
        assert returning_resp.json()['owner'] == str(salesperson_user.id)  # ya asignado al vendedor

        _upload_and_approve_payment(bootcamper, second_program, admin_user, second_program.total_cost)

        admin_client = make_client(admin_user)
        kpis = admin_client.get(ANALYTICS_KPIS_URL).json()
        by_program = {p['program_id']: p for p in kpis['payment_collection']['by_program']}
        assert by_program[str(second_program.id)]['collected_amount'] == float(second_program.total_cost)
        # El primer programa de este test sí tiene la Enrollment de la conversión inicial
        # (agreed_price == total_cost) pero ningún pago aprobado contra él en este test —
        # ambas filas de payment_collection conviven correctamente en la misma respuesta.
        assert by_program[str(program.id)]['expected_amount'] == float(program.total_cost)
        assert by_program[str(program.id)]['collected_amount'] == 0.0
