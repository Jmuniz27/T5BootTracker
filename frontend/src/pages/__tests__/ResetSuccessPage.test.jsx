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
});
