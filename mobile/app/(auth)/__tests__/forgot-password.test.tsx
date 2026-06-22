import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ForgotPasswordScreen from '../forgot-password';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  Link: ({ children }: any) => <>{children}</>,
}));

jest.mock('../../../src/lib/api', () => ({
  api: { post: jest.fn() }
}));

describe('ForgotPasswordScreen', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('renders without crashing', async () => {
    let root;
    await act(async () => {
      root = renderer.create(<ForgotPasswordScreen />);
    });
    expect(root?.toJSON()).toBeTruthy();
  });
});
