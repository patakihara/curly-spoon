import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import '@auralis/ui/styles.css';
import './styles/app.css';
import { AppBoundary } from './components/AppBoundary.js';
import { ApiProvider } from './api/ApiContext.js';
import { createAppQueryClient } from './api/queryClient.js';
import { router } from './router/router.js';
import { registerServiceWorker } from './pwa/registerServiceWorker.js';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const queryClient = createAppQueryClient();

createRoot(container).render(
  <StrictMode>
    <AppBoundary>
      <ApiProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApiProvider>
    </AppBoundary>
  </StrictMode>,
);

registerServiceWorker();
