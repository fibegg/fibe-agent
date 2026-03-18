import { vi } from 'vitest';

// Mock prism-loader to prevent 80+ prismjs dynamic imports from racing
// against test worker shutdown (causes "Closing rpc while fetch was pending").
vi.mock('./file-explorer/prism-loader', () => ({
  highlightCodeElement: vi.fn(),
}));

import { render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

import App from './app';

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
