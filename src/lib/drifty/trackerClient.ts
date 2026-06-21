import {
  buildAppUsageSummaries,
  buildCategoryDurations,
  buildProductivityDurations,
  totalDurationSeconds,
  type ActivitySegment,
  type CategoryDuration,
  type ProductivityDuration
} from '../domain';
import { LEGACY_CATEGORY_TO_DRIFTY, mapLegacyCategoryToDrifty, type LegacyCategory } from './legacyMapping';
import { currentLegacySessionToActivitySegment, legacySessionsToActivitySegments, type LegacyCurrentSessionResponse, type LegacySession } from './sessionConversion';
import { DRIFTY_BROWSER_SETTINGS_DEFAULTS, mergeBrowserSettings, type DriftyBrowserSettings } from './settings';
import { DRIFTY_CATEGORY_LIST, type DriftyCategoryMetadata } from './taxonomy';
import { requestDriftyRuntimeData } from './runtimeMessages';

export type LegacyCategoryStats = {
  time?: number;
  sessionCount?: number;
  topSites?: Array<string | { domain?: string; time?: number }>;
};

export type LegacyStats = {
  date?: string;
  categories?: Record<string, LegacyCategoryStats>;
  totalTime?: number;
  pickups?: number;
  sessions?: LegacySession[];
  recentSessions?: LegacySession[];
  dailyStats?: Array<LegacyStats & { date: string }>;
};

export type DriftyStatsSummary = {
  totalSeconds: number;
  categoryDurations: CategoryDuration[];
  productivityDurations: ProductivityDuration[];
  topActivities: ReturnType<typeof buildAppUsageSummaries>;
  segments: ActivitySegment[];
  legacy: unknown;
};

function syntheticSessionsFromLegacyStats(stats: LegacyStats): LegacySession[] {
  const categories = stats.categories ?? {};
  let cursor = Date.now() - (stats.totalTime ?? 0);

  return Object.entries(categories).flatMap(([legacyCategory, categoryStats]) => {
    const duration = categoryStats.time ?? 0;
    if (duration <= 0) {
      return [];
    }

    const startTime = cursor;
    cursor += duration;
    const topSite = categoryStats.topSites?.[0];
    const domain = typeof topSite === 'string' ? topSite : topSite?.domain;

    return [{
      id: `legacy-${legacyCategory}-${startTime}`,
      category: legacyCategory,
      startTime,
      endTime: startTime + duration,
      duration,
      visits: domain ? [{ url: `https://${domain}`, title: domain }] : []
    }];
  });
}

function segmentsFromLegacyStats(stats: LegacyStats): ActivitySegment[] {
  return legacySessionsToActivitySegments(stats.sessions ?? stats.recentSessions ?? syntheticSessionsFromLegacyStats(stats));
}

export function summarizeLegacyStats(stats: LegacyStats): DriftyStatsSummary {
  const segments = segmentsFromLegacyStats(stats);

  return {
    totalSeconds: totalDurationSeconds(segments),
    categoryDurations: buildCategoryDurations(segments),
    productivityDurations: buildProductivityDurations(segments),
    topActivities: buildAppUsageSummaries(segments, { limit: 5 }),
    segments,
    legacy: stats
  };
}

export type DriftyWeeklyStatsSummary = DriftyStatsSummary & {
  days: Array<{ date?: string; summary: DriftyStatsSummary }>;
};

function dedupeSegments(segments: ActivitySegment[]): ActivitySegment[] {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = segment.id || `${segment.startedAt}|${segment.endedAt}|${segment.appName}|${segment.siteDomain ?? ''}|${segment.siteUrl ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeLegacyWeeklyStats(stats: LegacyStats): DriftyWeeklyStatsSummary {
  const days = (stats.dailyStats ?? []).map((day) => ({ date: day.date, summary: summarizeLegacyStats(day) }));
  const segments = dedupeSegments(days.flatMap((day) => day.summary.segments));

  return {
    totalSeconds: totalDurationSeconds(segments),
    categoryDurations: buildCategoryDurations(segments),
    productivityDurations: buildProductivityDurations(segments),
    topActivities: buildAppUsageSummaries(segments, { limit: 5 }),
    segments,
    legacy: stats,
    days
  };
}

export type DriftyBrowserCategory = DriftyCategoryMetadata & {
  legacyKeys: string[];
};

export function convertLegacyCategories(categories: unknown): DriftyBrowserCategory[] {
  const legacyKeys = categories && typeof categories === 'object' ? Object.keys(categories) : Object.keys(LEGACY_CATEGORY_TO_DRIFTY);

  return DRIFTY_CATEGORY_LIST.map((metadata) => ({
    ...metadata,
    legacyKeys: legacyKeys.filter((legacyKey) => mapLegacyCategoryToDrifty(legacyKey as LegacyCategory).category === metadata.id)
  }));
}

export const browserTrackerClient = {
  async getTodayStats(): Promise<DriftyStatsSummary> {
    return summarizeLegacyStats(await requestDriftyRuntimeData({ type: 'GET_TODAY_STATS' }) as LegacyStats);
  },

  async getWeeklyStats(): Promise<DriftyWeeklyStatsSummary> {
    return summarizeLegacyWeeklyStats(await requestDriftyRuntimeData({ type: 'GET_WEEKLY_STATS' }) as LegacyStats);
  },

  async getDateStats(date: string): Promise<DriftyStatsSummary> {
    return summarizeLegacyStats(await requestDriftyRuntimeData({ type: 'GET_DATE_STATS', date }) as LegacyStats);
  },

  async getCurrentSession(): Promise<ActivitySegment | null> {
    return currentLegacySessionToActivitySegment(await requestDriftyRuntimeData({ type: 'GET_CURRENT_SESSION' }) as LegacyCurrentSessionResponse);
  },

  async getPopupData(): Promise<{ today: DriftyStatsSummary; week: DriftyWeeklyStatsSummary; currentSession: ActivitySegment | null }> {
    const response = await requestDriftyRuntimeData({ type: 'GET_POPUP_DATA' }) as { today: LegacyStats; week: LegacyStats; currentSession: LegacyCurrentSessionResponse };
    return {
      today: summarizeLegacyStats(response.today),
      week: summarizeLegacyWeeklyStats(response.week),
      currentSession: currentLegacySessionToActivitySegment(response.currentSession)
    };
  },

  async getSettings(): Promise<DriftyBrowserSettings & { legacy: unknown }> {
    return mergeBrowserSettings(await requestDriftyRuntimeData({ type: 'GET_SETTINGS' }));
  },

  async getCategories(): Promise<DriftyBrowserCategory[]> {
    return convertLegacyCategories(await requestDriftyRuntimeData({ type: 'GET_CATEGORIES' }));
  },

  defaults: DRIFTY_BROWSER_SETTINGS_DEFAULTS
};
