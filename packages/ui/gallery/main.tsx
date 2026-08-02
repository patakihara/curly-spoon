import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/index.css';
import './gallery.css';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) throw new Error('Gallery root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
