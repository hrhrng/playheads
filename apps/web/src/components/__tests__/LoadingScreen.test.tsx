import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from '../LoadingScreen';

describe('LoadingScreen', () => {
  it('renders a loading image', () => {
    render(<LoadingScreen />);
    const img = screen.getByAltText('Loading');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/logo.jpg');
  });
});
