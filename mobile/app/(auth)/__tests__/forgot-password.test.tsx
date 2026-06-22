import React from 'react';
import renderer from 'react-test-renderer';
import ForgotPasswordScreen from '../forgot-password';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  Link: ({ children }: any) => <>{children}</>,
}));

jest.mock('../../../src/lib/api', () => ({
  api: { post: jest.fn() }
}));

describe('ForgotPasswordScreen', () => {
  it('renders without crashing', () => {
    const tree = renderer.create(<ForgotPasswordScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
