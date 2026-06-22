import React from 'react';
import renderer, { act } from 'react-test-renderer';
import HomeScreen from '../home';

describe('HomeScreen', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('renders without crashing', async () => {
    let root: any;
    await act(async () => {
      root = renderer.create(<HomeScreen />);
    });
    expect(root?.toJSON()).toBeTruthy();
  });
});
