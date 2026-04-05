import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import { initTheme } from './app/theme';
import './app/postmessage-auth';
import { logConsoleBanner } from './app/console-banner';
import App from './app/app';

logConsoleBanner();
initTheme();

if (typeof window !== 'undefined' && window !== window.parent) {
  window.parent.postMessage({ type: 'iframe_ready' }, '*');
}

declare global {
  interface Window {
    __BASENAME__?: string;
  }
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

const basename = typeof window !== 'undefined' && window.__BASENAME__ ? window.__BASENAME__ : '/';

root.render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
