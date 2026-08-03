import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '../UsersPage';
import { useAuthStore } from '../../store/auth.store';
import { getUsers, toggleUserActive, createUser } from '../../api/users.api';

import { getPrograms, getSelfAssignmentSetting } from '../../api/leads.api';

vi.mock('../../api/users.api', () => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  toggleUserActive: vi.fn(),
  resetUserPassword: vi.fn(),
}));

vi.mock('../../api/leads.api', () => ({
  getPrograms: vi.fn(),
  getSelfAssignmentSetting: vi.fn(),
  updateSelfAssignmentSetting: vi.fn(),
}));

const PROGRAMA = { id: 'prog-1', name: 'Python Full Stack Abril 2026' };

/** Credencial de prueba, no un secreto real. */
const CLAVE_TEMPORAL = 'clave1234';

const ADMIN = {
  id: 'admin-1',
  email: 'admin@espol.edu.ec',
  first_name: 'Admin',
  last_name: 'Uno',
  full_name: 'Admin Uno',
  role: 'ADMINISTRATOR',
  cedula: '0926687856',
  is_active: true,
};

const VENDEDOR = {
  id: 'sales-1',
  email: 'vendedor@espol.edu.ec',
  first_name: 'Vendedor',
  last_name: 'Uno',
  full_name: 'Vendedor Uno',
  role: 'SALESPERSON',
  cedula: null,
  is_active: true,
};

const INACTIVO = {
  id: 'fin-1',
  email: 'finanzas@espol.edu.ec',
  first_name: 'Finanzas',
  last_name: 'Dos',
  full_name: 'Finanzas Dos',
  role: 'FINANCE',
  cedula: null,
  is_active: false,
};

const COORDINADOR = {
  id: 'coord-1',
  email: 'coordinador@espol.edu.ec',
  first_name: 'Coord',
  last_name: 'Tres',
  full_name: 'Coord Tres',
  role: 'COORDINATOR',
  cedula: null,
  is_active: true,
  coordinator_scope: 'PROGRAM',
  coordinator_programs: [PROGRAMA.id],
  coordinator_program_names: [PROGRAMA.name],
};

const BOOTCAMPER = {
  id: 'boot-1',
  email: 'bootcamper@espol.edu.ec',
  first_name: 'Boot',
  last_name: 'Camper',
  full_name: 'Boot Camper',
  role: 'BOOTCAMPER',
  cedula: null,
  is_active: true,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UsersPage />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

/** Fila de la tabla que contiene el nombre dado. */
function rowFor(name) {
  return screen.getByText(name).closest('tr');
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: ADMIN });
    getUsers.mockResolvedValue({ results: [ADMIN, VENDEDOR, INACTIVO, COORDINADOR] });
    getPrograms.mockResolvedValue([PROGRAMA]);
    getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('muestra el control de auto-asignación de leads (CR-004)', async () => {
    renderPage();

    expect(await screen.findByRole('switch', { name: /auto-asignación/i })).toBeInTheDocument();
  });

  it('lista los usuarios con su rol y estado', async () => {
    renderPage();

    expect(await screen.findByText('Vendedor Uno')).toBeInTheDocument();
    expect(within(rowFor('Vendedor Uno')).getByText('Vendedor')).toBeInTheDocument();
    expect(within(rowFor('Vendedor Uno')).getByText('Activo')).toBeInTheDocument();
    expect(within(rowFor('Finanzas Dos')).getByText('Inactivo')).toBeInTheDocument();
  });

  it('filtra por texto de búsqueda', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Vendedor Uno');

    await user.type(screen.getByPlaceholderText(/buscar por nombre/i), 'finanzas');

    expect(screen.getByText('Finanzas Dos')).toBeInTheDocument();
    expect(screen.queryByText('Vendedor Uno')).not.toBeInTheDocument();
  });

  it('deshabilita el cambio de estado sobre la propia cuenta', async () => {
    renderPage();
    await screen.findByText('Admin Uno');

    expect(within(rowFor('Admin Uno')).getByRole('button', { name: /desactivar/i })).toBeDisabled();
    expect(within(rowFor('Vendedor Uno')).getByRole('button', { name: /desactivar/i })).toBeEnabled();
  });

  it('pide confirmación antes de desactivar y muestra un toast al lograrlo', async () => {
    const user = userEvent.setup();
    toggleUserActive.mockResolvedValue({ ...VENDEDOR, is_active: false });
    renderPage();
    await screen.findByText('Vendedor Uno');

    await user.click(within(rowFor('Vendedor Uno')).getByRole('button', { name: /desactivar/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no podrá volver a iniciar sesión/i)).toBeInTheDocument();
    expect(toggleUserActive).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^desactivar$/i }));

    expect(toggleUserActive).toHaveBeenCalledWith('sales-1');
    expect(await screen.findByText(/fue desactivado/i)).toBeInTheDocument();
  });

  it('no cambia el estado si se cancela la confirmación', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Vendedor Uno');

    await user.click(within(rowFor('Vendedor Uno')).getByRole('button', { name: /desactivar/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancelar/i }));

    expect(toggleUserActive).not.toHaveBeenCalled();
  });

  it('muestra un toast de error si el backend rechaza el cambio de estado', async () => {
    const user = userEvent.setup();
    toggleUserActive.mockRejectedValue({
      response: { data: { detail: 'No puedes modificar tu propio estado.' } },
    });
    renderPage();
    await screen.findByText('Vendedor Uno');

    await user.click(within(rowFor('Vendedor Uno')).getByRole('button', { name: /desactivar/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^desactivar$/i }));

    expect(await screen.findByText('No puedes modificar tu propio estado.')).toBeInTheDocument();
  });

  it('valida la cédula en el formulario de creación antes de llamar al backend', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Vendedor Uno');

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    const dialog = await screen.findByRole('dialog', { name: /nuevo usuario/i });

    await user.type(within(dialog).getByPlaceholderText('Ana'), 'Nueva');
    await user.type(within(dialog).getByPlaceholderText('Vera'), 'Persona');
    await user.type(within(dialog).getByPlaceholderText(/@espol/i), 'nueva@espol.edu.ec');
    await user.type(within(dialog).getByPlaceholderText(/mínimo 8 caracteres/i), CLAVE_TEMPORAL);
    await user.type(within(dialog).getByPlaceholderText('0912345678'), '0926687857');

    await user.click(within(dialog).getByRole('button', { name: /seleccionar rol/i }));
    await user.click(within(dialog).getByText('Vendedor'));

    await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

    expect(await within(dialog).findByText(/cédula ecuatoriana inválida/i)).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('crea un usuario con datos válidos', async () => {
    const user = userEvent.setup();
    createUser.mockResolvedValue({ ...VENDEDOR, id: 'new-1', full_name: 'Nueva Persona' });
    renderPage();
    await screen.findByText('Vendedor Uno');

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    const dialog = await screen.findByRole('dialog', { name: /nuevo usuario/i });

    await user.type(within(dialog).getByPlaceholderText('Ana'), 'Nueva');
    await user.type(within(dialog).getByPlaceholderText('Vera'), 'Persona');
    await user.type(within(dialog).getByPlaceholderText(/@espol/i), 'nueva@espol.edu.ec');
    await user.type(within(dialog).getByPlaceholderText(/mínimo 8 caracteres/i), CLAVE_TEMPORAL);

    await user.click(within(dialog).getByRole('button', { name: /seleccionar rol/i }));
    await user.click(within(dialog).getByText('Vendedor'));

    await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

    // react-query invoca mutationFn con (variables, context) — solo interesa el primero.
    expect(createUser.mock.calls[0][0]).toEqual({
      first_name: 'Nueva',
      last_name: 'Persona',
      email: 'nueva@espol.edu.ec',
      role: 'SALESPERSON',
      password: CLAVE_TEMPORAL,
      cedula: null,
      phone: null,
      coordinator_scope: '',
      coordinator_programs: [],
    });
    expect(await screen.findByText(/creado correctamente/i)).toBeInTheDocument();
  });

  describe('alcance del coordinador', () => {
    /** Abre el modal y llena los campos comunes con el rol Coordinador. */
    async function openCoordinatorForm(user) {
      await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));
      const dialog = await screen.findByRole('dialog', { name: /nuevo usuario/i });

      await user.type(within(dialog).getByPlaceholderText('Ana'), 'Nueva');
      await user.type(within(dialog).getByPlaceholderText('Vera'), 'Coord');
      await user.type(within(dialog).getByPlaceholderText(/@espol/i), 'coord@espol.edu.ec');
      await user.type(within(dialog).getByPlaceholderText(/mínimo 8 caracteres/i), CLAVE_TEMPORAL);

      await user.click(within(dialog).getByRole('button', { name: /seleccionar rol/i }));
      await user.click(within(dialog).getByText('Coordinador'));

      return dialog;
    }

    it('muestra el alcance solo cuando el rol es Coordinador', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Vendedor Uno');

      await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));
      const dialog = await screen.findByRole('dialog', { name: /nuevo usuario/i });

      await user.click(within(dialog).getByRole('button', { name: /seleccionar rol/i }));
      await user.click(within(dialog).getByText('Vendedor'));
      expect(within(dialog).queryByText('Alcance')).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Vendedor' }));
      await user.click(within(dialog).getByText('Coordinador'));
      expect(within(dialog).getByText('Alcance')).toBeInTheDocument();
    });

    it('exige elegir el alcance antes de llamar al backend', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Vendedor Uno');

      const dialog = await openCoordinatorForm(user);
      await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

      expect(await within(dialog).findByText(/general o de un programa/i)).toBeInTheDocument();
      expect(createUser).not.toHaveBeenCalled();
    });

    it('exige al menos un programa cuando el alcance es por programa', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Vendedor Uno');

      const dialog = await openCoordinatorForm(user);
      await user.click(within(dialog).getByRole('button', { name: /seleccionar alcance/i }));
      await user.click(within(dialog).getByText(/por programa/i));

      await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

      expect(await within(dialog).findByText(/selecciona al menos un programa/i)).toBeInTheDocument();
      expect(createUser).not.toHaveBeenCalled();
    });

    it('crea un coordinador general sin programa', async () => {
      const user = userEvent.setup();
      createUser.mockResolvedValue({ ...COORDINADOR, full_name: 'Nueva Coord' });
      renderPage();
      await screen.findByText('Vendedor Uno');

      const dialog = await openCoordinatorForm(user);
      await user.click(within(dialog).getByRole('button', { name: /seleccionar alcance/i }));
      await user.click(within(dialog).getByText(/todos los programas/i));

      await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

      expect(createUser.mock.calls[0][0]).toMatchObject({
        role: 'COORDINATOR',
        coordinator_scope: 'GENERAL',
        coordinator_programs: [],
      });
    });

    it('crea un coordinador atado a un programa', async () => {
      const user = userEvent.setup();
      createUser.mockResolvedValue({ ...COORDINADOR, full_name: 'Nueva Coord' });
      renderPage();
      await screen.findByText('Vendedor Uno');

      const dialog = await openCoordinatorForm(user);
      await user.click(within(dialog).getByRole('button', { name: /seleccionar alcance/i }));
      await user.click(within(dialog).getByText(/por programa/i));

      await user.click(await within(dialog).findByLabelText(PROGRAMA.name));

      await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

      expect(createUser.mock.calls[0][0]).toMatchObject({
        role: 'COORDINATOR',
        coordinator_scope: 'PROGRAM',
        coordinator_programs: [PROGRAMA.id],
      });
    });

    it('muestra el programa asignado en la tabla', async () => {
      renderPage();
      await screen.findByText('Coord Tres');

      const row = within(rowFor('Coord Tres'));
      expect(row.getByText('Coordinador')).toBeInTheDocument();
      expect(row.getByText(PROGRAMA.name)).toBeInTheDocument();
    });

    it('no pide contraseña al coordinador', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Vendedor Uno');

      await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));
      const dialog = await screen.findByRole('dialog', { name: /nuevo usuario/i });

      expect(within(dialog).getByPlaceholderText(/mínimo 8 caracteres/i)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: /seleccionar rol/i }));
      await user.click(within(dialog).getByText('Coordinador'));

      expect(
        within(dialog).queryByPlaceholderText(/mínimo 8 caracteres/i),
      ).not.toBeInTheDocument();
    });

    it('descarta la contraseña escrita antes de pasar a coordinador', async () => {
      const user = userEvent.setup();
      createUser.mockResolvedValue({ ...COORDINADOR, full_name: 'Nueva Coord' });
      renderPage();
      await screen.findByText('Vendedor Uno');

      // openCoordinatorForm escribe la contraseña y después cambia el rol.
      const dialog = await openCoordinatorForm(user);
      await user.click(within(dialog).getByRole('button', { name: /seleccionar alcance/i }));
      await user.click(within(dialog).getByText(/todos los programas/i));
      await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

      expect(createUser.mock.calls[0][0].password).toBe('');
    });

    it('permite marcar varios programas', async () => {
      const user = userEvent.setup();
      const otro = { id: 'prog-2', name: 'Data Science Junio 2026' };
      getPrograms.mockResolvedValue([PROGRAMA, otro]);
      createUser.mockResolvedValue({ ...COORDINADOR, full_name: 'Nueva Coord' });
      renderPage();
      await screen.findByText('Vendedor Uno');

      const dialog = await openCoordinatorForm(user);
      await user.click(within(dialog).getByRole('button', { name: /seleccionar alcance/i }));
      await user.click(within(dialog).getByText(/por programa/i));

      await user.click(await within(dialog).findByLabelText(PROGRAMA.name));
      await user.click(await within(dialog).findByLabelText(otro.name));

      await user.click(within(dialog).getByRole('button', { name: /crear usuario/i }));

      expect(createUser.mock.calls[0][0]).toMatchObject({
        coordinator_scope: 'PROGRAM',
        coordinator_programs: [PROGRAMA.id, otro.id],
      });
    });
  });

  describe('pestañas Administrativos / Bootcampers', () => {
    beforeEach(() => {
      getUsers.mockResolvedValue({ results: [ADMIN, VENDEDOR, INACTIVO, COORDINADOR, BOOTCAMPER] });
    });

    it('arranca en "Administrativos" y no muestra bootcampers', async () => {
      renderPage();

      await screen.findByText('Vendedor Uno');
      expect(screen.getByTestId('tab-staff')).toHaveTextContent('Administrativos (4)');
      expect(screen.getByTestId('tab-bootcampers')).toHaveTextContent('Bootcampers (1)');
      expect(screen.queryByText('Boot Camper')).not.toBeInTheDocument();
    });

    it('la pestaña "Bootcampers" solo muestra bootcampers y oculta el filtro de rol', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Vendedor Uno');

      await user.click(screen.getByTestId('tab-bootcampers'));

      expect(await screen.findByText('Boot Camper')).toBeInTheDocument();
      expect(screen.queryByText('Vendedor Uno')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /todos los roles/i })).not.toBeInTheDocument();
    });

    it('el filtro de estado sigue funcionando dentro de "Bootcampers"', async () => {
      const user = userEvent.setup();
      getUsers.mockResolvedValue({
        results: [ADMIN, VENDEDOR, INACTIVO, COORDINADOR, BOOTCAMPER, { ...BOOTCAMPER, id: 'boot-2', full_name: 'Boot Inactivo', is_active: false }],
      });
      renderPage();
      await screen.findByText('Vendedor Uno');

      await user.click(screen.getByTestId('tab-bootcampers'));
      await screen.findByText('Boot Camper');

      await user.click(screen.getByRole('button', { name: /todos los estados/i }));
      await user.click(screen.getByRole('option', { name: 'Activos' }));

      expect(screen.getByText('Boot Camper')).toBeInTheDocument();
      expect(screen.queryByText('Boot Inactivo')).not.toBeInTheDocument();
    });
  });
});
