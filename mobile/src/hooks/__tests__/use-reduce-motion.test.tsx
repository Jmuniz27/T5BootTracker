import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';
import { useReduceMotion } from '../use-reduce-motion';

function Probe() {
  const reduceMotion = useReduceMotion();
  return <Text>{reduceMotion ? 'reduced' : 'normal'}</Text>;
}

describe('useReduceMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reflects the initial system value once resolved', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    let root: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<Probe />);
    });

    expect(root!.toJSON()).toEqual(expect.objectContaining({ children: ['reduced'] }));
  });

  it('defaults to false while resolving', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    let root: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<Probe />);
    });

    expect(root!.toJSON()).toEqual(expect.objectContaining({ children: ['normal'] }));
  });
});
