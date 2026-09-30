import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import './fonts/fonts.css';
import './generated/tokens/sonora-tokens.css';
import './generated/tokens/sonora-theme.css';
import './base.css';
import { App } from './App';
import { routes } from './generated/nav/routes';
import { withSignInData } from './sign-in';

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App router={createBrowserRouter(withSignInData(routes))} />
    </StrictMode>,
  );
}
