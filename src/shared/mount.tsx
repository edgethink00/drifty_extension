import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import './styles.css';
import { applyTheme, readStoredTheme } from './theme';
import { applyCategoryColors, readStoredCategoryColors } from './categoryColors';

// Apply the user's stored theme + category colors (falling back to defaults) before first paint,
// so every surface (popup, dashboard, onboarding) honours explicit display preferences.
applyTheme(readStoredTheme());
applyCategoryColors(readStoredCategoryColors());

export function mountSurface(node: ReactNode) {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Drifty root element was not found.');
  }

  createRoot(rootElement).render(node);
}
