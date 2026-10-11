import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely attempt fetch wrapping without throwing if window.fetch is non-configurable or getter-only
try {
  const originalFetch = window.fetch;
  if (originalFetch) {
    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (typeof url === 'string' && url.includes('/api/')) {
        let token: string | null = null;
        try {
          token = localStorage.getItem('journal_token');
        } catch (e) {}

        const headers = new Headers(init?.headers || {});
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        return originalFetch.call(window, input, {
          ...init,
          headers,
          credentials: init?.credentials || 'include',
        });
      }
      return originalFetch.call(window, input, init);
    };

    try {
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      // Ignore if window.fetch has only a getter in strict sandboxes
    }
  }
} catch (e) {
  // Ignored - components use authFetch directly
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
