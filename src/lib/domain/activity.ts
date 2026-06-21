export const FLOW_INTERVAL_OPTIONS = [3, 5, 10] as const;

export type FlowIntervalMinutes = typeof FLOW_INTERVAL_OPTIONS[number];
export type ProductivityLabel = 'focus' | 'neutral' | 'drift';
export type ActivityCategory =
  | 'workspace'
  | 'learning'
  | 'communication'
  | 'music'
  | 'game'
  | 'social_media'
  | 'entertainment'
  | 'shopping'
  | 'utility'
  | 'unknown';
export type ClassificationSource = 'youtube' | 'domain-db' | 'app-db' | 'context' | 'fallback' | 'llm' | 'manual' | 'rule' | 'stored' | 'unknown';

export type ActivityClassification = {
  category: ActivityCategory;
  productivity: ProductivityLabel;
};

export type StoredActivityClassification = ActivityClassification & {
  source: ClassificationSource;
  confidence: number | null;
  reason?: string | null;
  taxonomyVersion?: string | null;
  aiResult?: boolean;
  stale?: boolean;
};

export type ActivitySegment = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  appName: string;
  bundleId: string | null;
  windowTitle: string | null;
  browserName: string | null;
  siteDomain: string | null;
  siteTitle: string | null;
  siteUrl: string | null;
  siteSource: 'applescript' | 'applescript-front-window' | 'accessibility-address-bar' | 'window-title' | 'unknown' | null;
  platform: 'macos' | 'windows' | 'ios' | 'android';
  source: 'nsworkspace' | 'accessibility' | 'manual' | 'unknown';
  confidence: number | null;
  classification?: StoredActivityClassification | null;
};

export type ActivityClassificationDetail = ActivityClassification & {
  source: ClassificationSource;
  confidence: number | null;
};

export type CategoryDuration = {
  category: ActivityCategory;
  totalSeconds: number;
  ratio: number;
  segments: number;
};

export type ProductivityDuration = {
  productivity: ProductivityLabel;
  totalSeconds: number;
  ratio: number;
  segments: number;
};

export type AppUsageSummary = {
  usageKind: 'app' | 'site';
  appName: string;
  bundleId: string | null;
  browserName: string | null;
  siteDomain: string | null;
  siteTitle: string | null;
  totalSeconds: number;
  sessionCount: number;
  averageSessionSeconds: number;
  activeDays: number;
};

export type FlowBlock = {
  minuteOfDay: number;
  durationSeconds: number;
  appName: string;
  bundleId?: string | null;
  browserName?: string | null;
  windowTitle?: string | null;
  siteDomain?: string | null;
  siteTitle?: string | null;
  category: ActivityCategory;
  productivity: ProductivityLabel;
  classificationSource: ClassificationSource;
  aiClassification: boolean;
};
