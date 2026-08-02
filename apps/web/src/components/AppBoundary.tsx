/**
 * The outermost safety net — catches errors thrown *above* the router (a bad
 * theme token, a provider failing to construct), which `RouteErrorBoundary`
 * cannot see since it only wraps route content. React error boundaries must be
 * class components; there is no hooks-based equivalent.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
     
    console.error('Auralis failed to start', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auralis-error-surface" role="alert" data-testid="app-boundary">
        <h1>Auralis couldn't start</h1>
        <p>{this.state.error.message || 'An unexpected error occurred.'}</p>
        <button type="button" onClick={this.handleReload}>
          Reload
        </button>
      </div>
    );
  }
}
