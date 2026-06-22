import React from 'react';
import renderer from 'react-test-renderer';
import HomeScreen from '../home';

describe('HomeScreen', () => {
  it('renders without crashing', () => {
    const tree = renderer.create(<HomeScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
