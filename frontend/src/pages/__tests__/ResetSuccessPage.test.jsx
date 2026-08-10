import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ResetSuccessPage from '../ResetSuccessPage';

describe('ResetSuccessPage', () => {
  it('renders without crashing', () => {
    render(
      <BrowserRouter>
        <ResetSuccessPage />
      </BrowserRouter>
    );
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('el título y el icono bajan un escalón en móvil', () => {
    const { container } = render(
      <BrowserRouter>
        <ResetSuccessPage />
      </BrowserRouter>
    );
    expect(screen.getByRole('heading')).toHaveClass('text-2xl', 'sm:text-3xl');
    expect(container.querySelector('.rounded-full')).toHaveClass('w-14', 'h-14', 'sm:w-16', 'sm:h-16');
  });
});
