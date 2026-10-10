import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cyber-bg flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-cyber-surface border border-cyber-secondary p-6 rounded shadow-lg">
            <h2 className="text-xl font-bold text-cyber-secondary mb-4">CRITICAL SYSTEM FAILURE</h2>
            <p className="text-cyber-textDim mb-4">The application encountered an unexpected error and needs to be reloaded.</p>
            <pre className="bg-black/50 p-4 rounded text-xs text-cyber-secondary overflow-x-auto mb-6">
              {this.state.error?.message}
            </pre>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full bg-cyber-secondary/20 text-cyber-secondary border border-cyber-secondary hover:bg-cyber-secondary hover:text-white px-4 py-2 rounded transition-colors"
            >
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
