import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LeadDetailScreen from '../index';

const CONVERTED_LEAD = {
  id: 'lead-1',
  name: 'Ana Vera',
  phone: '0991234567',
  email: 'ana@test.com',
  source: 'MANUAL',
  status: 'CONVERTED',
  is_company: false,
  program_interest: 'Full Stack',
  interaction_count: 2,
  owner: 'owner-1',
  owner_name: 'Vendedor Uno',
  bootcamper: 'boot-1',
  bootcamper_verification_status: 'INVITED',
};

let mockFocusEffectRan = false;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    id: 'lead-1',
    lead: JSON.stringify(CONVERTED_LEAD),
    owned: '1',
  }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useFocusEffect: (cb: any) => {
    // Emula el foco inicial una sola vez: react-test-renderer no tiene ciclo
    // de navegación real, así que sin este guard `cb()` se relanzaría en cada
    // render (setLead → nuevo render → cb() de nuevo → loop infinito).
    if (!mockFocusEffectRan) {
      mockFocusEffectRan = true;
      cb();
    }
  },
}));

const mockGetLead = jest.fn();
const mockResendInvitation = jest.fn();

jest.mock('../../../../../src/api/leads.api', () => ({
  assignLead: jest.fn(),
  releaseLead: jest.fn(),
  updateLeadStatus: jest.fn(),
  discardLead: jest.fn(),
  restoreLead: jest.fn(),
  getLead: (...args: any[]) => mockGetLead(...args),
  resendInvitation: (...args: any[]) => mockResendInvitation(...args),
  getSelfAssignmentEnabled: () => Promise.resolve(true),
}));

jest.mock('../../../../../src/hooks/use-quick-call', () => ({
  useQuickCall: () => ({ startCall: jest.fn() }),
}));

const mockCopy = jest.fn();
const mockShare = jest.fn();

jest.mock('../../../../../src/lib/invitation', () => ({
  copyInvitationLink: (...args: any[]) => mockCopy(...args),
  shareInvitationLink: (...args: any[]) => mockShare(...args),
}));

function findAllByText(root: any, text: string | RegExp) {
  return root.root.findAll(
    (node: any) =>
      Array.isArray(node.children) &&
      node.children.some((c: any) => typeof c === 'string' && (typeof text === 'string' ? c === text : text.test(c))),
  );
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

jest.setTimeout(20000);

describe('LeadDetailScreen — reenvío de invitación', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusEffectRan = false;
    mockGetLead.mockResolvedValue(CONVERTED_LEAD);
  });

  it('un lead convertido con bootcamper INVITED muestra la opción de reenviar', async () => {
    let root: any;
    await act(async () => {
      root = renderer.create(<LeadDetailScreen />);
    });

    expect(findAllByText(root, 'Reenviar invitación').length).toBeGreaterThan(0);
  });

  it('un bootcamper ya activado (PENDING_VERIFICATION) no ofrece reenviar', async () => {
    mockGetLead.mockResolvedValue({ ...CONVERTED_LEAD, bootcamper_verification_status: 'PENDING_VERIFICATION' });

    let root: any;
    await act(async () => {
      root = renderer.create(<LeadDetailScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findAllByText(root, 'Reenviar invitación').length).toBe(0);
  });

  it('al reenviar, muestra el link nuevo con copiar y compartir', async () => {
    mockResendInvitation.mockResolvedValue({ invitation_link: 'https://app.test/onboarding/nuevo' });

    let root: any;
    await act(async () => {
      root = renderer.create(<LeadDetailScreen />);
    });

    await pressText(root, 'Reenviar invitación');

    expect(mockResendInvitation).toHaveBeenCalledWith('lead-1');
    expect(findAllByText(root, 'https://app.test/onboarding/nuevo').length).toBeGreaterThan(0);
  });

  it('el botón compartir del modal de reenvío usa el link nuevo', async () => {
    mockResendInvitation.mockResolvedValue({ invitation_link: 'https://app.test/onboarding/nuevo' });
    mockShare.mockResolvedValue(true);

    let root: any;
    await act(async () => {
      root = renderer.create(<LeadDetailScreen />);
    });

    await pressText(root, 'Reenviar invitación');
    await pressText(root, 'Compartir');

    expect(mockShare).toHaveBeenCalledWith('https://app.test/onboarding/nuevo', 'Ana Vera');
  });
});

describe('LeadDetailScreen — estado de la cuenta del bootcamper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusEffectRan = false;
    mockGetLead.mockResolvedValue(CONVERTED_LEAD);
  });

  it('muestra el badge "Cuenta activa" cuando la cuenta ya está activada', async () => {
    mockGetLead.mockResolvedValue({ ...CONVERTED_LEAD, bootcamper_verification_status: 'VERIFIED' });

    let root: any;
    await act(async () => {
      root = renderer.create(<LeadDetailScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findAllByText(root, 'Cuenta activa').length).toBeGreaterThan(0);
    // Ya no existe verificación manual.
    expect(findAllByText(root, 'Marcar como verificado').length).toBe(0);
  });
});
