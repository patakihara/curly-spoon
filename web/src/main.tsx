import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import '../../design/sonora/styles.css';
import { App } from './App';
import { routes } from './generated/nav/routes';

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App router={createBrowserRouter(routes)} />
    </StrictMode>,
  );
}
