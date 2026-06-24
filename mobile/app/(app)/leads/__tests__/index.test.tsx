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
  useAuth: () => ({ logout: jest.fn() }),
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
