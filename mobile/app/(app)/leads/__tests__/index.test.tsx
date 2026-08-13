import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LeadsScreen from '../index';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../../src/api/leads.api', () => ({
  fetchLeads: jest.fn(() => Promise.resolve({ my_leads: [], available_leads: [] })),
  assignLead: jest.fn(),
  releaseLead: jest.fn(),
}));

jest.mock('../../../../src/lib/api', () => ({
  api: { get: jest.fn(() => Promise.resolve({ data: { full_name: 'Test', role: 'SALESPERSON' } })) }
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({ logout: jest.fn(), user: { role: 'SALESPERSON' } }),
}));

// LeadsScreen se envuelve en FadeInView (CB-115), que arranca un
// Animated.timing con useNativeDriver: true. Ese callback no siempre
// resuelve dentro del tick que react-test-renderer + act() esperan bajo
// carga (varios workers de Jest corriendo en paralelo), lo que hace flaky
// este test — pasa en aislamiento pero puede exceder el timeout de 5s
// corriendo junto al resto de la suite. Se mockea como passthrough, igual
// que en app/(app)/__tests__/agenda.test.tsx.
jest.mock('../../../../src/components/FadeInView', () => ({
  FadeInView: ({ children }: { children: React.ReactNode }) => children,
}));

describe('LeadsScreen', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('renders without crashing', async () => {
    let root: any;
    await act(async () => {
      root = renderer.create(<LeadsScreen />);
    });
    expect(root?.toJSON()).toBeTruthy();
  });
});
