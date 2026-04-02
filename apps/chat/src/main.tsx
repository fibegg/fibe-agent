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

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
