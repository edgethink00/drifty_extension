import type { ActivityCategory, ProductivityLabel, StoredActivityClassification } from '../domain';
import { DRIFTY_TAXONOMY_VERSION } from './taxonomy';

export type LegacyCategory =
  | 'productivity'
  | 'learning'
  | 'education'
  | 'communication'
  | 'social'
  | 'games'
  | 'entertainment'
  | 'music'
  | 'shopping'
  | 'utility'
  | 'news'
  | 'adult'
  | 'other'
  | 'uncategorized'
  | 'needs_server_classification'
  | string;

export type LegacyCategoryMapping = {
  category: ActivityCategory;
  productivity: ProductivityLabel;
};

export const LEGACY_CATEGORY_TO_DRIFTY: Record<string, LegacyCategoryMapping> = {
  productivity: { category: 'workspace', productivity: 'focus' },
  learning: { category: 'learning', productivity: 'focus' },
  education: { category: 'learning', productivity: 'focus' },
  communication: { category: 'communication', productivity: 'neutral' },
  social: { category: 'social_media', productivity: 'drift' },
  games: { category: 'game', productivity: 'drift' },
  entertainment: { category: 'entertainment', productivity: 'drift' },
  music: { category: 'music', productivity: 'neutral' },
  shopping: { category: 'shopping', productivity: 'drift' },
  utility: { category: 'utility', productivity: 'neutral' },
  news: { category: 'utility', productivity: 'neutral' },
  adult: { category: 'unknown', productivity: 'drift' },
  other: { category: 'unknown', productivity: 'neutral' },
  uncategorized: { category: 'unknown', productivity: 'neutral' },
  needs_server_classification: { category: 'unknown', productivity: 'neutral' }
};

export function mapLegacyCategoryToDrifty(category: LegacyCategory | null | undefined): LegacyCategoryMapping {
  return LEGACY_CATEGORY_TO_DRIFTY[category ?? ''] ?? LEGACY_CATEGORY_TO_DRIFTY.other;
}

export function legacyCategoryClassification(category: LegacyCategory | null | undefined): StoredActivityClassification {
  const mapped = mapLegacyCategoryToDrifty(category);

  return {
    ...mapped,
    source: category === 'needs_server_classification' || category === 'uncategorized' ? 'fallback' : 'rule',
    confidence: category && LEGACY_CATEGORY_TO_DRIFTY[category] ? 0.85 : 0.3,
    reason: category ? `Mapped from legacy extension category: ${category}` : 'Mapped from missing legacy extension category',
    taxonomyVersion: DRIFTY_TAXONOMY_VERSION,
    aiResult: false,
    stale: false
  };
}
