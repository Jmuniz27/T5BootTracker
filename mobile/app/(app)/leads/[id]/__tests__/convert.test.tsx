import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ConvertLeadScreen from '../convert';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    id: 'lead-1',
    name: 'Ana Vera',
    program: 'Full Stack',
    email: 'ana@test.com',
    phone: '0991234567',
  }),
  useRouter: () => ({ back: mockBack }),
}));

const mockConvertLead = jest.fn();
const mockGetPrograms = jest.fn();

jest.mock('../../../../../src/api/leads.api', () => ({
  convertLead: (...args: any[]) => mockConvertLead(...args),
  getPrograms: (...args: any[]) => mockGetPrograms(...args),
}));

const mockCopy = jest.fn();
const mockShare = jest.fn();

jest.mock('../../../../../src/lib/invitation', () => ({
  copyInvitationLink: (...args: any[]) => mockCopy(...args),
  shareInvitationLink: (...args: any[]) => mockShare(...args),
}));

// Helpers para navegar el árbol renderizado sin depender de RNTL, que en este
// proyecto no funciona con react-test-renderer 19 (createRoot no existe).
function findAllByText(root: any, text: string | RegExp) {
  return root.root.findAll(
    (node: any) =>
      Array.isArray(node.children) &&
      node.children.some((c: any) => typeof c === 'string' && (typeof text === 'string' ? c === text : text.test(c))),
  );
}

function findByPlaceholder(root: any, placeholder: string) {
  return root.root.find((node: any) => node.props?.placeholder === placeholder);
}

function findPressable(root: any, text: string) {
  const [textNode] = findAllByText(root, text);
  let node = textNode;
  while (node && typeof node.props?.onPress !== 'function') node = node.parent;
  return node;
}

async function pressText(root: any, text: string) {
  const node = findPressable(root, text);
  await act(async () => {
    node.props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function changeText(input: any, value: string) {
  await act(async () => {
    input.props.onChangeText?.(value);
    await Promise.resolve();
  });
}

function isConvertDisabled(root: any) {
  const [convertBtn] = findAllByText(root, 'Convertir');
  let node = convertBtn;
  while (node && node.props.disabled === undefined) node = node.parent;
  return node?.props?.disabled !== false;
}

/** Espera hasta que `getPrograms()` resuelva (el select de programa ya no está vacío). */
async function waitForProgramsLoaded(root: any) {
  for (let i = 0; i < 50; i++) {
    if (findAllByText(root, 'Cargando programas…').length === 0) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  throw new Error('getPrograms no resolvió a tiempo');
}

async function renderAndFillCedula() {
  let root: any;
  await act(async () => {
    root = renderer.create(<ConvertLeadScreen />);
  });
  await waitForProgramsLoaded(root);
  const cedulaInput = findByPlaceholder(root, '10 dígitos (cédula) o 13 (RUC)');
  await changeText(cedulaInput, '1710034065');
  if (isConvertDisabled(root)) {
    throw new Error('El botón Convertir sigue deshabilitado tras completar cédula/email/programa');
  }
  return root;
}

jest.setTimeout(20000);

describe('ConvertLeadScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrograms.mockResolvedValue([{ id: 'prog-1', name: 'Full Stack' }]);
  });

  it('lee la respuesta de convertLead y muestra el link en vez de descartarla', async () => {
    mockConvertLead.mockResolvedValue({
      email: 'ana@test.com',
      invitation_link: 'https://app.test/onboarding/tok',
      is_returning: false,
    });

    const root = await renderAndFillCedula();
    await pressText(root, 'Convertir');

    expect(findAllByText(root, 'https://app.test/onboarding/tok').length).toBeGreaterThan(0);
    // No navega atrás automáticamente: el vendedor tiene que confirmar con "Listo".
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('no muestra botón de compartir cuando el bootcamper es recurrente', async () => {
    mockConvertLead.mockResolvedValue({
      email: 'ana@test.com',
      invitation_link: null,
      is_returning: true,
    });

    const root = await renderAndFillCedula();
    await pressText(root, 'Convertir');

    expect(findAllByText(root, /bootcamper recurrente/i).length).toBeGreaterThan(0);
    expect(findAllByText(root, 'Compartir').length).toBe(0);
  });

  it('el botón compartir invoca el helper con el link y el nombre del lead', async () => {
    mockConvertLead.mockResolvedValue({
      email: 'ana@test.com',
      invitation_link: 'https://app.test/onboarding/tok',
      is_returning: false,
    });
    mockShare.mockResolvedValue(true);

    const root = await renderAndFillCedula();
    await pressText(root, 'Convertir');
    await pressText(root, 'Compartir');

    expect(mockShare).toHaveBeenCalledWith('https://app.test/onboarding/tok', 'Ana Vera');
  });

  it('el botón copiar invoca el helper de portapapeles con el link', async () => {
    mockConvertLead.mockResolvedValue({
      email: 'ana@test.com',
      invitation_link: 'https://app.test/onboarding/tok',
      is_returning: false,
    });

    const root = await renderAndFillCedula();
    await pressText(root, 'Convertir');
    await pressText(root, 'Copiar');

    expect(mockCopy).toHaveBeenCalledWith('https://app.test/onboarding/tok');
  });

  it('recién navega atrás cuando se presiona "Listo"', async () => {
    mockConvertLead.mockResolvedValue({
      email: 'ana@test.com',
      invitation_link: 'https://app.test/onboarding/tok',
      is_returning: false,
    });

    const root = await renderAndFillCedula();
    await pressText(root, 'Convertir');
    await pressText(root, 'Listo');

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('el botón Convertir queda deshabilitado si el email está vacío (campo requerido)', async () => {
    let root: any;
    await act(async () => {
      root = renderer.create(<ConvertLeadScreen />);
    });
    await waitForProgramsLoaded(root);

    const emailInput = findByPlaceholder(root, 'correo@ejemplo.com');
    const cedulaInput = findByPlaceholder(root, '10 dígitos (cédula) o 13 (RUC)');
    await changeText(cedulaInput, '1710034065');
    // Con email lleno el botón se habilita...
    expect(isConvertDisabled(root)).toBe(false);
    // ...y se deshabilita de nuevo en cuanto el campo requerido queda vacío.
    await changeText(emailInput, '');
    expect(isConvertDisabled(root)).toBe(true);
  });
});
