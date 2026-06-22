import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LoginScreen from '../login';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  Link: ({ children }: any) => <>{children}</>,
}));

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() }),
}));

describe('LoginScreen', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('renders without crashing', async () => {
    let root;
    await act(async () => {
      root = renderer.create(<LoginScreen />);
    });
    expect(root?.toJSON()).toBeTruthy();
  });
});
