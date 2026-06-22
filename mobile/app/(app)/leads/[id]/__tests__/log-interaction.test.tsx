import React from 'react';
import renderer from 'react-test-renderer';
import LogInteractionScreen from '../log-interaction';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '123' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('../../../../../src/api/leads.api', () => ({
  createInteraction: jest.fn(() => Promise.resolve({})),
}));

describe('LogInteractionScreen', () => {
  it('renders without crashing', () => {
    const tree = renderer.create(<LogInteractionScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
