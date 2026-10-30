import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { AuthProvider } from './context/AuthContext';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Sanjeevani AI Caught Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          height: '100vh',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#0f172a',
          color: '#fff',
          fontFamily: 'Inter, sans-serif',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid #ef4444',
            borderRadius: '16px',
            padding: '2.5rem',
            maxWidth: '500px',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)'
          }}>
            <h2 style={{ color: '#f87171', margin: '0 0 1rem' }}>System Re-synchronizing</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              A temporary initialization anomaly was caught. Click below to reconnect to the Sanjeevani AI medical network.
            </p>
            <button 
              onClick={() => {
                localStorage.removeItem('sanjeevani_token');
                window.location.reload();
              }}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}>
              Reload & Reconnect
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || "https://affable-porpoise-194.convex.cloud"); 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConvexProvider client={convex}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConvexProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
