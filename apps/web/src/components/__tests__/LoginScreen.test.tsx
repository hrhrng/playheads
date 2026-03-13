import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../LoginScreen';

describe('LoginScreen', () => {
  const defaultProps = {
    email: '',
    setEmail: vi.fn(),
    loading: false,
    message: null,
    onLogin: vi.fn((e: React.FormEvent) => { e.preventDefault(); return Promise.resolve(); }),
  };

  it('renders email input and submit button', () => {
    render(<LoginScreen {...defaultProps} />);
    expect(screen.getByPlaceholderText('Your email')).toBeInTheDocument();
    expect(screen.getByText('Sign In with Email')).toBeInTheDocument();
  });

  it('shows loading text when loading', () => {
    render(<LoginScreen {...defaultProps} loading={true} />);
    expect(screen.getByText('Sending Magic Link...')).toBeInTheDocument();
  });

  it('displays error message', () => {
    render(<LoginScreen {...defaultProps} message={{ type: 'error', text: 'Invalid email' }} />);
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
  });

  it('displays success message', () => {
    render(<LoginScreen {...defaultProps} message={{ type: 'success', text: 'Check your email!' }} />);
    expect(screen.getByText('Check your email!')).toBeInTheDocument();
  });

  it('calls setEmail on input change', async () => {
    const setEmail = vi.fn();
    render(<LoginScreen {...defaultProps} setEmail={setEmail} />);
    await userEvent.type(screen.getByPlaceholderText('Your email'), 'a');
    expect(setEmail).toHaveBeenCalled();
  });

  it('calls onLogin on form submit', async () => {
    const onLogin = vi.fn((e: React.FormEvent) => { e.preventDefault(); return Promise.resolve(); });
    render(<LoginScreen {...defaultProps} email="test@test.com" onLogin={onLogin} />);
    await userEvent.click(screen.getByText('Sign In with Email'));
    expect(onLogin).toHaveBeenCalled();
  });
});
