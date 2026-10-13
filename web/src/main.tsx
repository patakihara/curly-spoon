import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import './fonts/fonts.css';
import './generated/tokens/sonora-tokens.css';
import './generated/tokens/sonora-theme.css';
import './base.css';
import { App } from './App';
import { routes } from './generated/nav/routes';
import { withPageData } from './data';
import { watchForUpdates } from './update-watch';

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App router={createBrowserRouter(withPageData(routes))} />
    </StrictMode>,
  );
}

// The tab follows the app the server runs: it reloads onto a new commit once no audio plays.
watchForUpdates();
