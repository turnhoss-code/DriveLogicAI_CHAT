import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress Google Maps internal directions errors so they don't trigger AI Studio crash overlays
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const errString = args.map(arg => {
    if (arg instanceof Error) return arg.message || arg.toString();
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch(e) { return String(arg); }
    }
    return String(arg);
  }).join(' ');
  
  if (
    errString.includes('DIRECTIONS_ROUTE') || 
    errString.includes('MAX_ROUTE_LENGTH_EXCEEDED') ||
    errString.includes('Requested route too long') ||
    errString.includes('ZERO_RESULTS') ||
    errString.includes('NOT_FOUND')
  ) {
    return; // Ignore Maps API internal routing errors
  }
  originalConsoleError(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
