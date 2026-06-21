import type { ActivityCategory, ProductivityLabel } from '../domain';

export type DriftyCategoryMetadata = {
  id: ActivityCategory;
  label: string;
};

export type DriftyProductivityMetadata = {
  id: ProductivityLabel;
  label: string;
};

export const DRIFTY_TAXONOMY_VERSION = 'browser-extension-v1';

export const DRIFTY_CATEGORY_ORDER = [
  'workspace',
  'learning',
  'communication',
  'music',
  'game',
  'social_media',
  'entertainment',
  'shopping',
  'utility',
  'unknown'
] as const satisfies readonly ActivityCategory[];

export const DRIFTY_PRODUCTIVITY_LABELS = ['focus', 'neutral', 'drift'] as const satisfies readonly ProductivityLabel[];

export const DRIFTY_CATEGORY_METADATA: Record<ActivityCategory, DriftyCategoryMetadata> = {
  workspace: { id: 'workspace', label: 'Workspace' },
  learning: { id: 'learning', label: 'Learning' },
  communication: { id: 'communication', label: 'Communication' },
  music: { id: 'music', label: 'Music' },
  game: { id: 'game', label: 'Game' },
  social_media: { id: 'social_media', label: 'Social media' },
  entertainment: { id: 'entertainment', label: 'Entertainment' },
  shopping: { id: 'shopping', label: 'Shopping' },
  utility: { id: 'utility', label: 'Utility' },
  unknown: { id: 'unknown', label: 'Unknown' }
};

export const DRIFTY_PRODUCTIVITY_METADATA: Record<ProductivityLabel, DriftyProductivityMetadata> = {
  focus: { id: 'focus', label: 'Focus' },
  neutral: { id: 'neutral', label: 'Neutral' },
  drift: { id: 'drift', label: 'Drift' }
};

export const DRIFTY_CATEGORY_LIST = DRIFTY_CATEGORY_ORDER.map((category) => DRIFTY_CATEGORY_METADATA[category]);
export const DRIFTY_PRODUCTIVITY_LIST = DRIFTY_PRODUCTIVITY_LABELS.map((label) => DRIFTY_PRODUCTIVITY_METADATA[label]);
