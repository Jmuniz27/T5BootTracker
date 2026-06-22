import React from 'react';
import renderer from 'react-test-renderer';
import HistoryScreen from '../history';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '123' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../../../../../src/api/leads.api', () => ({
  getInteractions: jest.fn(() => Promise.resolve([])),
}));

describe('HistoryScreen', () => {
  it('renders without crashing', () => {
    const tree = renderer.create(<HistoryScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
