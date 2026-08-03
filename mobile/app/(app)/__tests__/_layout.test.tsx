import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AppLayout from '../_layout';
import { useAuth } from '../../../src/context/AuthContext';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
  SALESPERSON_ROLE: 'SALESPERSON',
}));

jest.mock('expo-router', () => ({
  Redirect: () => null,
  Stack: () => null,
}));

const mockUseAuth = useAuth as jest.Mock;

function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf((node as { children?: unknown }).children);
}

describe('AppLayout — solo vendedores', () => {
  afterEach(() => jest.clearAllMocks());

  it('bloquea a un rol que no es vendedor', () => {
    mockUseAuth.mockReturnValue({ token: 't', user: { role: 'ADMINISTRATOR' }, logout: jest.fn() });
    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<AppLayout />);
    });
    expect(textOf(root?.toJSON())).toContain('solo para vendedores');
  });

  it('deja pasar a un vendedor (sin pantalla de bloqueo)', () => {
    mockUseAuth.mockReturnValue({ token: 't', user: { role: 'SALESPERSON' }, logout: jest.fn() });
    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<AppLayout />);
    });
    expect(textOf(root?.toJSON())).not.toContain('solo para vendedores');
  });
});
