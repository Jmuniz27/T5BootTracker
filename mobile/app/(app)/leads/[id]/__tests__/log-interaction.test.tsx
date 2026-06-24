import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LogInteractionScreen from '../log-interaction';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '123' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../../../../../src/api/leads.api', () => ({
  createInteraction: jest.fn(() => Promise.resolve({})),
}));

describe('LogInteractionScreen', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('renders without crashing', async () => {
    let root: any;
    await act(async () => {
      root = renderer.create(<LogInteractionScreen />);
    });
    expect(root?.toJSON()).toBeTruthy();
  });
});
