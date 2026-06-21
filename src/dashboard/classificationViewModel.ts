import {
  classifyActivityDetailed,
  type ActivityCategory,
  type ActivitySegment,
  type ProductivityLabel
} from '../lib/domain';
import { DRIFTY_CATEGORY_METADATA, DRIFTY_PRODUCTIVITY_METADATA } from '../lib/drifty';
import { formatDuration, formatTimeLabel } from '../shared/format';

const PRODUCTIVITY_ORDER: ProductivityLabel[] = ['focus', 'neutral', 'drift'];

export type ClassificationSourceSummary = {
  id: string;
  label: string;
  usageKind: 'app' | 'site';
  appName: string;
  siteDomain: string | null;
  totalSeconds: number;
  sessionCount: number;
  averageSessionSeconds: number;
  shareOfTotal: number;
  productivityMix: Array<{ productivity: ProductivityLabel; totalSeconds: number; ratio: number }>;
};

type SourceDraft = ClassificationSourceSummary & {
  productivitySeconds: Record<ProductivityLabel, number>;
};

export type ClassificationCategoryBreakdown = {
  category: ActivityCategory;
  totalSeconds: number;
  sessionCount: number;
};

export type ClassificationActivityRow = {
  id: string;
  label: string;
  totalSeconds: number;
  count: number;
  startedLabel: string;
  endedLabel: string;
  segments: ActivitySegment[];
  hasDetails: boolean;
};

export function categoryLabel(category: ActivityCategory): string {
  return DRIFTY_CATEGORY_METADATA[category].label;
}

export function productivityLabel(productivity: ProductivityLabel): string {
  return DRIFTY_PRODUCTIVITY_METADATA[productivity].label;
}

export function classificationSourceLabel(source?: string | null, ai?: boolean | null): string {
  if (ai || source === 'llm') return 'AI';
  if (source === 'domain-db' || source === 'app-db' || source === 'youtube') return 'Predefined rule';
  if (source === 'context') return 'Context rule';
  if (source === 'fallback') return 'Fallback';
  if (source === 'manual') return 'Manual';
  if (source === 'rule') return 'Custom rule';
  if (source === 'stored') return 'Stored';
  return 'Unclassified rule';
}

export function segmentCategory(segment: ActivitySegment): ActivityCategory {
  return classifyActivityDetailed(segment).category;
}

export function segmentProductivity(segment: ActivitySegment): ProductivityLabel {
  return classifyActivityDetailed(segment).productivity;
}

export function buildCategoryBreakdowns(segments: ActivitySegment[]): ClassificationCategoryBreakdown[] {
  const rows = new Map<ActivityCategory, ClassificationCategoryBreakdown>();
  for (const segment of segments) {
    const category = segmentCategory(segment);
    const current = rows.get(category) ?? { category, totalSeconds: 0, sessionCount: 0 };
    current.totalSeconds += segment.durationSeconds;
    current.sessionCount += 1;
    rows.set(category, current);
  }

  return Array.from(rows.values()).sort((left, right) => right.totalSeconds - left.totalSeconds);
}

export function sourceIdentity(segment: ActivitySegment): Pick<ClassificationSourceSummary, 'id' | 'label' | 'usageKind' | 'appName' | 'siteDomain'> {
  const appName = segment.appName.trim() || 'Unknown app';
  const siteDomain = normalizeText(segment.siteDomain)?.toLowerCase() ?? null;
  const siteTitle = normalizeText(segment.siteTitle);

  if (siteDomain || siteTitle) {
    const label = siteDomain ?? siteTitle ?? appName;
    return {
      id: siteDomain ? `site:${siteDomain}` : `site-title:${label.toLowerCase()}:${appName}`,
      label,
      usageKind: 'site',
      appName,
      siteDomain
    };
  }

  return { id: `app:${appName}`, label: appName, usageKind: 'app', appName, siteDomain: null };
}

export function buildSourceSummaries(segments: ActivitySegment[]): ClassificationSourceSummary[] {
  const totalSeconds = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
  const rows = new Map<string, SourceDraft>();

  for (const segment of segments) {
    const identity = sourceIdentity(segment);
    const current = rows.get(identity.id) ?? {
      ...identity,
      totalSeconds: 0,
      sessionCount: 0,
      averageSessionSeconds: 0,
      shareOfTotal: 0,
      productivityMix: [],
      productivitySeconds: { focus: 0, neutral: 0, drift: 0 }
    };
    const productivity = segmentProductivity(segment);
    current.totalSeconds += segment.durationSeconds;
    current.sessionCount += 1;
    current.productivitySeconds[productivity] += segment.durationSeconds;
    rows.set(identity.id, current);
  }

  return Array.from(rows.values()).map((item) => {
    const productivityMix = PRODUCTIVITY_ORDER.map((productivity) => ({
      productivity,
      totalSeconds: item.productivitySeconds[productivity],
      ratio: item.totalSeconds > 0 ? item.productivitySeconds[productivity] / item.totalSeconds : 0
    })).filter((entry) => entry.totalSeconds > 0);

    return {
      id: item.id,
      label: item.label,
      usageKind: item.usageKind,
      appName: item.appName,
      siteDomain: item.siteDomain,
      totalSeconds: item.totalSeconds,
      sessionCount: item.sessionCount,
      averageSessionSeconds: item.sessionCount > 0 ? Math.round(item.totalSeconds / item.sessionCount) : 0,
      shareOfTotal: totalSeconds > 0 ? item.totalSeconds / totalSeconds : 0,
      productivityMix
    };
  }).sort((left, right) => right.totalSeconds - left.totalSeconds || left.label.localeCompare(right.label));
}

export function buildActivityRows(segments: ActivitySegment[]): ClassificationActivityRow[] {
  const rows = new Map<string, ClassificationActivityRow>();
  const ordered = segments.slice().sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  for (const segment of ordered) {
    const label = activityLabel(segment);
    const key = `${sourceIdentity(segment).id}:${label}`;
    const current = rows.get(key) ?? {
      id: key,
      label,
      totalSeconds: 0,
      count: 0,
      startedLabel: formatTimeLabel(segment.startedAt),
      endedLabel: formatTimeLabel(segment.endedAt),
      segments: [],
      hasDetails: false
    };
    current.totalSeconds += segment.durationSeconds;
    current.count += 1;
    current.endedLabel = formatTimeLabel(segment.endedAt);
    current.segments.push(segment);
    rows.set(key, current);
  }

  return Array.from(rows.values()).map((row) => ({
    ...row,
    hasDetails: row.count > 1 || row.segments.some((segment) => hasCaptureDetails(segment, row.label))
  })).sort((left, right) => right.totalSeconds - left.totalSeconds || left.label.localeCompare(right.label));
}

export function activityLabel(segment: ActivitySegment): string {
  return sanitizeCaptureText(segment.windowTitle || segment.siteTitle || segment.siteDomain || segment.appName);
}

export function activityDetailsId(rowId: string): string {
  const readable = rowId.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'activity';
  return `classification-activity-details-${readable}-${hashString(rowId)}`;
}

export function captureSurfaceDetails(segments: ActivitySegment[]): string[] {
  const details = new Set<string>();
  for (const segment of segments) {
    if (segment.appName) details.add(`App: ${segment.appName}`);
    if (segment.browserName) details.add(`Browser: ${segment.browserName}`);
    if (segment.siteDomain) details.add(`Domain: ${segment.siteDomain}`);
  }
  return Array.from(details);
}

export function classificationRowSummary(segments: ActivitySegment[]) {
  const classifications = segments.map((segment) => classifyActivityDetailed(segment));
  const first = classifications[0];
  if (!first) return null;

  const categoryValues = new Set(classifications.map((item) => item.category));
  const productivityValues = new Set(classifications.map((item) => item.productivity));
  const sourceValues = new Set(classifications.map((item) => item.source));
  const confidenceValues = classifications
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    categoryLabel: categoryValues.size > 1 ? 'Mixed' : categoryLabel(first.category),
    productivityLabel: productivityValues.size > 1 ? 'Mixed' : productivityLabel(first.productivity),
    sourceLabel: sourceValues.size > 1 ? 'Mixed' : classificationSourceLabel(first.source, first.source === 'llm'),
    confidenceLabel: confidenceValues.length === classifications.length
      ? `${Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(confidenceValues.length, 1)) * 100)}%`
      : 'Confidence unavailable'
  };
}

export function formatSourceProductivityMix(mix: ClassificationSourceSummary['productivityMix']): string {
  if (mix.length === 0) return 'No productivity signal';
  return mix.map((entry) => `${productivityLabel(entry.productivity)} ${formatDuration(entry.totalSeconds)}`).join(', ');
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function sanitizeCaptureText(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, '[link]').replace(/\bwww\.\S+/gi, '[link]').trim().replace(/\s+/g, ' ');
}

function hasCaptureDetails(segment: ActivitySegment, rowLabel: string): boolean {
  const title = (segment.siteTitle || segment.windowTitle || '').trim();
  return Boolean(segment.browserName || segment.siteDomain || (title && title !== rowLabel) || segment.classification?.source || segment.classification?.confidence != null);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
