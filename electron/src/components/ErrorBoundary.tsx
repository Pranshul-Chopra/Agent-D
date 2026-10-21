import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center p-6 bg-[#111110]">
          <div className="max-w-md w-full bg-[#1a1918] border border-[#2e2c2a] rounded-xl p-6 text-center shadow-xl">
            <div className="w-12 h-12 rounded-full bg-[#e85c4c]/10 text-[#e85c4c] mx-auto flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-[#edeae4] mb-2">
              {this.props.fallbackTitle || 'Component Error Occurred'}
            </h3>
            <p className="text-xs text-[#9b9690] mb-4 leading-relaxed">
              {this.state.error?.message || 'An unexpected rendering error was intercepted.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-[#e8a84c] hover:bg-[#d4973b] text-black font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload View</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
