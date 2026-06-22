import React from 'react';
import renderer from 'react-test-renderer';
import LeadsScreen from '../index';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: jest.fn((cb) => cb()),
}));

jest.mock('../../../../src/api/leads.api', () => ({
  fetchLeads: jest.fn(() => Promise.resolve({ my_leads: [], available_leads: [] })),
  assignLead: jest.fn(),
  releaseLead: jest.fn(),
}));

jest.mock('../../../../src/lib/api', () => ({
  api: { get: jest.fn(() => Promise.resolve({ data: { full_name: 'Test', role: 'SALESPERSON' } })) }
}));

describe('LeadsScreen', () => {
  it('renders without crashing', () => {
    const tree = renderer.create(<LeadsScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
