import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

import App from './app';

// Mock prism-loader to prevent 80+ prismjs dynamic imports from racing
// against test worker shutdown (causes "Closing rpc while fetch was pending").
// Vitest auto-hoists vi.mock calls, so placement after imports is fine.
vi.mock('./file-explorer/prism-loader', () => ({
  highlightCodeElement: vi.fn(),
}));

vi.stubGlobal('Worker', class MockWorker {
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  postMessage = vi.fn();
  terminate = vi.fn();
});

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(baseElement).toBeTruthy();
  });

  it('should show login form when not authenticated', async () => {
    const { findByRole } = render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );
    expect(await findByRole('button', { name: 'Login' }, { timeout: 5000 })).toBeTruthy();
  });
});
