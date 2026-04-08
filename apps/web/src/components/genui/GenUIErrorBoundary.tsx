/**
 * GenUIErrorBoundary — catches rendering errors in GenUI components
 * so a broken visual doesn't crash the entire chat interface.
 */
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GenUIErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[GenUI] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <p className="font-medium">Visual could not be rendered</p>
          <p className="text-[11px] text-amber-600 mt-1">
            The content is available but encountered a display error.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
