import { useCallback, useEffect, useState } from 'react';

// Category color overrides are a local display preference, persisted like the theme and applied
// by overriding the `--category-*` CSS custom properties on the document root.

const COLORS_STORAGE_KEY = 'drifty-category-colors';

export type CategoryColorOverrides = Record<string, string>;

export function categoryColorVar(categoryId: string): string {
  return `--category-${categoryId.replace(/_/g, '-')}`;
}

export function readStoredCategoryColors(): CategoryColorOverrides {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(COLORS_STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as CategoryColorOverrides;
  } catch {
    // Ignore malformed stored colors; fall back to the stylesheet defaults.
  }
  return {};
}

export function applyCategoryColors(overrides: CategoryColorOverrides): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [categoryId, color] of Object.entries(overrides)) {
    if (color) root.style.setProperty(categoryColorVar(categoryId), color);
  }
}

function persistCategoryColors(overrides: CategoryColorOverrides): void {
  try {
    localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore persistence failures; in-memory overrides still apply for this session.
  }
}

export function useCategoryColors(): {
  overrides: CategoryColorOverrides;
  setColor: (categoryId: string, color: string) => void;
  resetColor: (categoryId: string) => void;
} {
  const [overrides, setOverrides] = useState<CategoryColorOverrides>(() => readStoredCategoryColors());

  useEffect(() => {
    applyCategoryColors(overrides);
  }, [overrides]);

  const setColor = useCallback((categoryId: string, color: string) => {
    setOverrides((current) => {
      const next = { ...current, [categoryId]: color };
      persistCategoryColors(next);
      return next;
    });
  }, []);

  const resetColor = useCallback((categoryId: string) => {
    setOverrides((current) => {
      const next = { ...current };
      delete next[categoryId];
      persistCategoryColors(next);
      if (typeof document !== 'undefined') document.documentElement.style.removeProperty(categoryColorVar(categoryId));
      return next;
    });
  }, []);

  return { overrides, setColor, resetColor };
}
