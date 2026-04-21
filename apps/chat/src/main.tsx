import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import { initTheme } from './app/theme';
import './app/postmessage-auth';
import './app/keybind-forwarder';
import { logConsoleBanner } from './app/console-banner';
import App from './app/app';
import { IframeReadySignal } from './app/iframe-ready-signal';

logConsoleBanner();
initTheme();

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
    <IframeReadySignal />
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
