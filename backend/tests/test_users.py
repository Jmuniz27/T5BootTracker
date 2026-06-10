import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from apps.authentication.models import CustomUser

# Le decimos a pytest que todas las pruebas aquí necesitan acceso a la base de datos
pytestmark = pytest.mark.django_db

# --- FIXTURES (Datos de prueba reutilizables) ---

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def admin_user():
    user = CustomUser(
        email='admin_test@boottracker.com',
        role=CustomUser.Role.ADMINISTRATOR,
        first_name='Admin',
        last_name='Test'
    )
    user.set_password('admin1234')
    user.save()
    return user

@pytest.fixture
def normal_user():
    user = CustomUser(
        email='bootcamper_test@boottracker.com',
        role=CustomUser.Role.BOOTCAMPER,
        first_name='Boot',
        last_name='Camper'
    )
    user.set_password('boot1234')
    user.save()
    return user

@pytest.fixture
def target_user():
    """Usuario que vamos a editar/eliminar en las pruebas"""
    user = CustomUser(
        email='target@boottracker.com',
        role=CustomUser.Role.COORDINATOR,
        cedula='0958156687', # Cédula válida mod-10 para pasar la validación
        first_name='Target',
        last_name='User'
    )
    user.set_password('target123')
    user.save()
    return user


# --- PRUEBAS DE PERMISOS ---

def test_non_admin_gets_403_on_user_endpoints(api_client, normal_user, target_user):
    """Verifica que un usuario sin rol ADMINISTRATOR reciba un 403 Forbidden"""
    api_client.force_authenticate(user=normal_user)

    # 1. Intentar listar
    response = api_client.get(reverse('user-list'))
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # 2. Intentar crear
    response = api_client.post(reverse('user-list'), data={})
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # 3. Intentar eliminar
    response = api_client.delete(reverse('user-detail', args=[target_user.id]))
    assert response.status_code == status.HTTP_403_FORBIDDEN


# --- PRUEBAS DE CRUD (Como Admin) ---

def test_admin_can_list_users(api_client, admin_user, target_user):
    api_client.force_authenticate(user=admin_user)
    response = api_client.get(reverse('user-list'))

    assert response.status_code == status.HTTP_200_OK
    assert 'results' in response.data
    assert len(response.data['results']) >= 2

    # Extraemos todos los emails que devolvió la API
    emails_in_response = [user['email'] for user in response.data['results']]

    # Validamos que el target_user realmente esté en la lista
    assert target_user.email in emails_in_response
    assert admin_user.email in emails_in_response


def test_admin_can_create_user(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    data = {
        'email': 'nuevo@boottracker.com',
        'cedula': '0923456789', # Ajusta a una cédula mod-10 válida si tu validador es estricto
        'first_name': 'Juan',
        'last_name': 'Perez',
        'role': CustomUser.Role.SALESPERSON,
        'password': 'password_segura_123',
        'phone': '0999999999'
    }

    response = api_client.post(reverse('user-list'), data=data)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['email'] == data['email']
    # Verificamos que no exponga el password en la respuesta
    assert 'password' not in response.data
    # Verificamos que realmente se guardó en BD
    assert CustomUser.objects.filter(email='nuevo@boottracker.com').exists()


def test_create_user_duplicate_email_fails(api_client, admin_user, target_user):
    api_client.force_authenticate(user=admin_user)
    data = {
        'email': target_user.email, # Correo que ya existe
        'first_name': 'Clon',
        'last_name': 'Malo',
        'role': CustomUser.Role.BOOTCAMPER,
        'password': 'pwd'
    }

    response = api_client.post(reverse('user-list'), data=data)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'email' in response.data


def test_admin_can_update_user(api_client, admin_user, target_user):
    api_client.force_authenticate(user=admin_user)
    data = {'first_name': 'NombreEditado'}

    response = api_client.patch(reverse('user-detail', args=[target_user.id]), data=data)

    assert response.status_code == status.HTTP_200_OK
    assert response.data['first_name'] == 'NombreEditado'
    target_user.refresh_from_db()
    assert target_user.first_name == 'NombreEditado'


def test_admin_can_soft_delete_user(api_client, admin_user, target_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.delete(reverse('user-detail', args=[target_user.id]))

    assert response.status_code == status.HTTP_204_NO_CONTENT
    target_user.refresh_from_db()
    assert target_user.is_active is False # Verificamos el soft-delete


def test_admin_cannot_delete_himself(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.delete(reverse('user-detail', args=[admin_user.id]))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    admin_user.refresh_from_db()
    assert admin_user.is_active is True


# --- PRUEBAS DE ENDPOINTS PERSONALIZADOS ---

def test_toggle_active_status(api_client, admin_user, target_user):
    api_client.force_authenticate(user=admin_user)
    assert target_user.is_active is True

    # Desactivar
    response = api_client.post(reverse('user-toggle-active', args=[target_user.id]))
    assert response.status_code == status.HTTP_200_OK
    assert response.data['is_active'] is False

    # Activar de nuevo
    response = api_client.post(reverse('user-toggle-active', args=[target_user.id]))
    assert response.data['is_active'] is True


def test_reset_password_generates_new_password(api_client, admin_user, target_user):
    api_client.force_authenticate(user=admin_user)
    old_password_hash = target_user.password

    response = api_client.post(reverse('user-reset-password', args=[target_user.id]))

    assert response.status_code == status.HTTP_200_OK
    assert 'new_password' in response.data

    new_password = response.data['new_password']
    assert len(new_password) == 12 # Verificamos la longitud generada por secrets

    target_user.refresh_from_db()
    assert target_user.password != old_password_hash
    assert target_user.check_password(new_password) is True # El nuevo password debe funcionar
