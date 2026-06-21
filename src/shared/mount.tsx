import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import './styles.css';

function applyTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', prefersDark);
}

applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  document.documentElement.classList.toggle('dark', e.matches);
});

export function mountSurface(node: ReactNode) {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Drifty root element was not found.');
  }

  createRoot(rootElement).render(node);
}
