/**
 * Error Boundary component to catch and handle React errors
 * @module components/ErrorBoundary
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);

    // Here you could also log to an error reporting service
    // like Sentry, LogRocket, etc.
  }

  handleReload = (): void => {
    // Reload the page to reset the app
    window.location.reload();
  };

  handleReset = (): void => {
    // Try to recover by resetting the error boundary
    this.setState({
      hasError: false,
      error: null
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-strong rounded-sheet shadow-glass p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full overflow-hidden shadow-cover">
              <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover" />
            </div>

            <h1 className="text-2xl font-display font-semibold text-ink mb-2">
              Something went wrong
            </h1>

            <p className="text-ink-2 mb-6">
              We're sorry, but something unexpected happened. Please try reloading the page.
            </p>

            {this.state.error && (
              <details className="text-left mb-6 p-4 bg-chip rounded-2xl hairline">
                <summary className="cursor-pointer text-sm font-medium text-ink-2 mb-2">
                  Error details
                </summary>
                <pre className="text-xs text-ink-3 overflow-auto max-h-32">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-chip-2 text-ink rounded-full hover:bg-chip-hover transition-colors"
              >
                Try again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-ink text-page rounded-full hover:bg-ink/85 transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
