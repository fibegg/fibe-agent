import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

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

  it('should show login title when not authenticated', async () => {
    const { findByText } = render(
      <BrowserRouter initialEntries={['/login']}>
        <App />
      </BrowserRouter>,
    );
    expect(await findByText('Agent Authentication')).toBeTruthy();
  });
});
