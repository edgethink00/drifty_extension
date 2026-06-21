import type { ActivityCategory, ActivitySegment, AppUsageSummary, CategoryDuration, FlowBlock, FlowIntervalMinutes, ProductivityDuration, ProductivityLabel } from './activity';
import { classifyActivityDetailed } from './classification';
import { logicalDayIsoDateForDate, logicalMinuteOfDay } from './date';

type TopOptions = {
  readonly limit?: number;
};

type FlowAccumulator = FlowBlock & {
  segmentCount: number;
};

export function totalDurationSeconds(segments: readonly ActivitySegment[]): number {
  return segments.reduce((sum, segment) => sum + Math.max(0, segment.durationSeconds), 0);
}

export function buildCategoryDurations(segments: readonly ActivitySegment[]): CategoryDuration[] {
  const total = totalDurationSeconds(segments);
  const rows = new Map<ActivityCategory, CategoryDuration>();
  for (const segment of segments) {
    const category = classifyActivityDetailed(segment).category;
    const current = rows.get(category) ?? { category, totalSeconds: 0, ratio: 0, segments: 0 };
    current.totalSeconds += segment.durationSeconds;
    current.segments += 1;
    rows.set(category, current);
  }
  return Array.from(rows.values()).map((row) => ({ ...row, ratio: total > 0 ? row.totalSeconds / total : 0 })).sort(durationSort);
}

export function buildProductivityDurations(segments: readonly ActivitySegment[]): ProductivityDuration[] {
  const total = totalDurationSeconds(segments);
  const rows = new Map<ProductivityLabel, ProductivityDuration>();
  for (const segment of segments) {
    const productivity = classifyActivityDetailed(segment).productivity;
    const current = rows.get(productivity) ?? { productivity, totalSeconds: 0, ratio: 0, segments: 0 };
    current.totalSeconds += segment.durationSeconds;
    current.segments += 1;
    rows.set(productivity, current);
  }
  return Array.from(rows.values()).map((row) => ({ ...row, ratio: total > 0 ? row.totalSeconds / total : 0 })).sort(durationSort);
}

export function buildAppUsageSummaries(segments: readonly ActivitySegment[], options: TopOptions = {}): AppUsageSummary[] {
  const rows = new Map<string, AppUsageSummary & { activeDaySet: Set<string> }>();
  for (const segment of segments) {
    const usageKind = segment.siteDomain || segment.siteTitle ? 'site' : 'app';
    const key = usageKind === 'site'
      ? `site:${(segment.siteDomain ?? segment.siteTitle ?? segment.appName).toLowerCase()}`
      : `app:${segment.bundleId ?? segment.appName}`;
    const current = rows.get(key) ?? {
      usageKind,
      appName: segment.appName,
      bundleId: segment.bundleId,
      browserName: segment.browserName,
      siteDomain: segment.siteDomain,
      siteTitle: segment.siteTitle,
      totalSeconds: 0,
      sessionCount: 0,
      averageSessionSeconds: 0,
      activeDays: 0,
      activeDaySet: new Set<string>()
    };
    current.totalSeconds += segment.durationSeconds;
    current.sessionCount += 1;
    current.averageSessionSeconds = Math.round(current.totalSeconds / current.sessionCount);
    current.activeDaySet.add(segment.startedAt.slice(0, 10));
    current.activeDays = current.activeDaySet.size;
    rows.set(key, current);
  }

  return Array.from(rows.values())
    .map(({ activeDaySet: _activeDaySet, ...row }) => row)
    .sort(durationSort)
    .slice(0, options.limit ?? 5);
}

export function buildFlowBlocks(
  segments: readonly ActivitySegment[],
  day: string,
  intervalMinutes: FlowIntervalMinutes,
  _options?: unknown,
  startOfDayMinutes = 0
): FlowBlock[] {
  const blocks = new Map<number, FlowAccumulator>();
  for (const segment of segments) {
    const startMs = new Date(segment.startedAt).getTime();
    const endMs = new Date(segment.endedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    for (let cursor = startMs; cursor < endMs; cursor += intervalMinutes * 60 * 1000) {
      if (logicalDayIsoDateForDate(new Date(cursor), startOfDayMinutes) !== day) continue;
      const clockMinute = new Date(cursor).getHours() * 60 + new Date(cursor).getMinutes();
      const minuteOfDay = Math.floor(logicalMinuteOfDay(clockMinute, startOfDayMinutes) / intervalMinutes) * intervalMinutes;
      const overlapEnd = Math.min(endMs, cursor + intervalMinutes * 60 * 1000);
      addFlowBlock(blocks, minuteOfDay, segment, Math.max(1, Math.round((overlapEnd - cursor) / 1000)));
    }
  }
  return Array.from(blocks.values()).map(({ segmentCount: _segmentCount, ...block }) => block).sort((left, right) => left.minuteOfDay - right.minuteOfDay);
}

function addFlowBlock(blocks: Map<number, FlowAccumulator>, minuteOfDay: number, segment: ActivitySegment, durationSeconds: number): void {
  const classification = classifyActivityDetailed(segment);
  const current = blocks.get(minuteOfDay);
  if (!current || durationSeconds > current.durationSeconds) {
    blocks.set(minuteOfDay, {
      minuteOfDay,
      durationSeconds,
      appName: segment.appName,
      bundleId: segment.bundleId,
      browserName: segment.browserName,
      windowTitle: segment.windowTitle,
      siteDomain: segment.siteDomain,
      siteTitle: segment.siteTitle,
      category: classification.category,
      productivity: classification.productivity,
      classificationSource: classification.source,
      aiClassification: classification.source === 'llm',
      segmentCount: 1
    });
    return;
  }
  current.durationSeconds += durationSeconds;
  current.segmentCount += 1;
}

function durationSort<T extends { readonly totalSeconds: number }>(left: T, right: T): number {
  return right.totalSeconds - left.totalSeconds;
}
