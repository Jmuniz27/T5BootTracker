import React from 'react';
import renderer, { act } from 'react-test-renderer';
import HistoryScreen from '../history';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '123' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../../../../../src/api/leads.api', () => ({
  getInteractions: jest.fn(() => Promise.resolve([])),
}));

describe('HistoryScreen', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('renders without crashing', async () => {
    let root: any;
    await act(async () => {
      root = renderer.create(<HistoryScreen />);
    });
    expect(root?.toJSON()).toBeTruthy();
  });
});
