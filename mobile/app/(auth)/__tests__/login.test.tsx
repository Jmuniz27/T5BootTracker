import React from 'react';
import renderer from 'react-test-renderer';
import LoginScreen from '../login';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  Link: ({ children }: any) => <>{children}</>,
}));

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() }),
}));

describe('LoginScreen', () => {
  it('renders without crashing', () => {
    const tree = renderer.create(<LoginScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
