import {
  classifyActivityDetailed,
  secondsToLabel,
  logicalDayEndExclusiveMs,
  logicalDayStartMs,
  type ActivityCategory,
  type ActivitySegment,
  type ClassificationSource,
  type ProductivityLabel
} from '../lib/domain';

const MINUTES_PER_DAY = 24 * 60;
const UI_LOCALE = 'en-US';

export type WeekDayRow = {
  readonly day: string;
  readonly dayName: string;
  readonly dayNumber: string;
  readonly totalSeconds: number;
  readonly focusSeconds: number;
};

export type WeekCalendarEvent = {
  readonly id: string;
  readonly appName: string;
  readonly siteDomain: string | null;
  readonly category: ActivityCategory;
  readonly productivity: ProductivityLabel;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly detailSummary: string;
  readonly detailTitle: string;
  readonly sessionCount: number;
  readonly isGroupedCluster: boolean;
  readonly topMinutes: number;
  readonly durationMinutes: number;
  readonly isShort: boolean;
  readonly lane: number;
  readonly laneCount: number;
};

type DayAccumulator = {
  totalSeconds: number;
  focusSeconds: number;
};

type SegmentOverlap = {
  readonly day: string;
  readonly startMs: number;
  readonly endMs: number;
};

type WeekCalendarIdentity = {
  readonly id: string;
  readonly label: string;
  readonly appName: string;
  readonly bundleId: string | null;
  readonly browserName: string | null;
  readonly siteDomain: string | null;
  readonly siteTitle: string | null;
};

type WeekCalendarEventIdentity = WeekCalendarIdentity & {
  seconds: number;
  firstStartMinute: number;
};

type WeekCalendarSourceInterval = {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly category: ActivityCategory;
  readonly productivity: ProductivityLabel;
  readonly appName: string;
  readonly identity: WeekCalendarIdentity;
  readonly classificationSource: ClassificationSource;
  readonly aiClassification: boolean;
  readonly seconds: number;
  readonly segmentId: string;
};

type WeekCalendarBucket = {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly sourceIntervals: WeekCalendarSourceInterval[];
};

type WeekCalendarBucketComponent = {
  readonly coveredStartMinute: number;
  readonly coveredEndMinute: number;
  readonly categoryTotals: Map<ActivityCategory, number>;
  readonly productivityTotals: Map<ProductivityLabel, number>;
  readonly appTotals: Map<string, number>;
  readonly identityTotals: Map<string, WeekCalendarEventIdentity>;
  readonly sourceTotals: Map<ClassificationSource, number>;
  readonly aiSeconds: number;
  readonly segmentIds: Set<string>;
  readonly totalSeconds: number;
  readonly category: ActivityCategory;
  readonly productivity: ProductivityLabel;
  readonly classificationSource: ClassificationSource;
};

const BUCKET_MINUTES = 15;
const SHORT_EVENT_MINUTES = 30;
const MEANINGFUL_GAP_MINUTES = 10;
const VISUAL_MERGE_WINDOW_MINUTES = 24;
const MEANINGFUL_INTERRUPTION_SECONDS = 10 * 60;
const MIXED_SHARE_THRESHOLD = 0.25;
const MIXED_MINIMUM_SECONDS = 8 * 60;
const STANDALONE_EVENT_SECONDS = 5 * 60;

export function isoDayList(startDay: string, endDay: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startDay}T12:00:00`);
  const end = new Date(`${endDay}T12:00:00`);

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function buildWeekDayRows(segments: readonly ActivitySegment[], startDay: string, endDay: string, startOfDayMinutes: number): WeekDayRow[] {
  const days = isoDayList(startDay, endDay);
  const totals = new Map<string, DayAccumulator>(days.map((day) => [day, { totalSeconds: 0, focusSeconds: 0 }]));

  for (const segment of segments) {
    const classification = classifyActivityDetailed(segment);
    for (const overlap of splitSegmentIntoDays(segment, startDay, endDay, startOfDayMinutes)) {
      const row = totals.get(overlap.day);
      if (!row) continue;
      const durationSeconds = Math.round((overlap.endMs - overlap.startMs) / 1000);
      row.totalSeconds += durationSeconds;
      if (classification.productivity === 'focus') row.focusSeconds += durationSeconds;
    }
  }

  return days.map((day) => {
    const total = totals.get(day) ?? { totalSeconds: 0, focusSeconds: 0 };
    const date = new Date(`${day}T12:00:00`);
    return {
      day,
      dayName: new Intl.DateTimeFormat(UI_LOCALE, { weekday: 'short' }).format(date),
      dayNumber: new Intl.DateTimeFormat(UI_LOCALE, { day: 'numeric' }).format(date),
      totalSeconds: total.totalSeconds,
      focusSeconds: total.focusSeconds
    };
  });
}

export function buildWeekCalendarEvents(segments: readonly ActivitySegment[], startDay: string, endDay: string, startOfDayMinutes: number): Map<string, WeekCalendarEvent[]> {
  const days = isoDayList(startDay, endDay);
  const eventsByDay = new Map<string, WeekCalendarEvent[]>(days.map((day) => [day, []]));
  const bucketsByDay = new Map<string, WeekCalendarBucket[]>(days.map((day) => [
    day,
    Array.from({ length: Math.ceil(MINUTES_PER_DAY / BUCKET_MINUTES) }, (_, index) => {
      const startMinute = index * BUCKET_MINUTES;
      return { startMinute, endMinute: Math.min(MINUTES_PER_DAY, startMinute + BUCKET_MINUTES), sourceIntervals: [] };
    })
  ]));

  for (const segment of segments) {
    const classification = classifyActivityDetailed(segment);
    const identity = weekCalendarSegmentIdentity(segment);
    for (const overlap of splitSegmentIntoDays(segment, startDay, endDay, startOfDayMinutes)) {
      const buckets = bucketsByDay.get(overlap.day);
      if (!buckets) continue;

      const dayStartMs = logicalDayStartMs(overlap.day, startOfDayMinutes);
      const startMinute = Math.max(0, Math.floor((overlap.startMs - dayStartMs) / 60000));
      const endMinute = Math.min(MINUTES_PER_DAY, Math.ceil((overlap.endMs - dayStartMs) / 60000));
      if (endMinute <= startMinute) continue;

      for (const bucket of buckets) {
        const bucketStartMs = dayStartMs + bucket.startMinute * 60 * 1000;
        const bucketEndMs = dayStartMs + bucket.endMinute * 60 * 1000;
        const overlapStartMs = Math.max(overlap.startMs, bucketStartMs);
        const overlapEndMs = Math.min(overlap.endMs, bucketEndMs);
        const overlapMs = overlapEndMs - overlapStartMs;
        if (overlapMs <= 0) continue;

        const overlapSeconds = Math.round(overlapMs / 1000);
        let intervalStartMinute = Math.max(bucket.startMinute, Math.round((overlapStartMs - dayStartMs) / 60000));
        let intervalEndMinute = Math.min(bucket.endMinute, Math.round((overlapEndMs - dayStartMs) / 60000));
        if (intervalEndMinute <= intervalStartMinute) {
          if (overlapSeconds < 30) continue;
          intervalStartMinute = Math.min(Math.max(bucket.startMinute, intervalStartMinute), bucket.endMinute - 1);
          intervalEndMinute = intervalStartMinute + 1;
        }

        bucket.sourceIntervals.push({
          startMinute: intervalStartMinute,
          endMinute: intervalEndMinute,
          category: classification.category,
          productivity: classification.productivity,
          appName: weekCalendarSegmentLabel(segment),
          identity,
          classificationSource: classification.source,
          aiClassification: classification.source === 'llm',
          seconds: overlapSeconds,
          segmentId: segment.id
        });
      }
    }
  }

  for (const [day, buckets] of bucketsByDay.entries()) {
    eventsByDay.set(day, buildEventsFromBuckets(day, buckets, startOfDayMinutes));
  }

  for (const [day, events] of eventsByDay.entries()) {
    eventsByDay.set(day, assignLanes(events));
  }

  return eventsByDay;
}

function splitSegmentIntoDays(segment: ActivitySegment, startDay: string, endDay: string, startOfDayMinutes: number): SegmentOverlap[] {
  const segmentStartMs = new Date(segment.startedAt).getTime();
  const segmentEndMs = new Date(segment.endedAt).getTime();
  if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs) || segmentEndMs <= segmentStartMs) return [];

  return isoDayList(startDay, endDay).flatMap((day) => {
    const overlapStart = Math.max(segmentStartMs, logicalDayStartMs(day, startOfDayMinutes));
    const overlapEnd = Math.min(segmentEndMs, logicalDayEndExclusiveMs(day, startOfDayMinutes));
    return overlapEnd > overlapStart ? [{ day, startMs: overlapStart, endMs: overlapEnd }] : [];
  });
}

function buildEventsFromBuckets(day: string, buckets: readonly WeekCalendarBucket[], startOfDayMinutes: number): WeekCalendarEvent[] {
  const events: WeekCalendarEvent[] = [];
  const dominantBuckets = buckets.flatMap(bucketComponents);
  let group: WeekCalendarBucketComponent[] = [];
  const groupCategorySeconds = new Map<ActivityCategory, number>();
  const groupProductivitySeconds = new Map<ProductivityLabel, number>();
  let groupTotalSeconds = 0;

  const flushGroup = () => {
    if (group.length === 0) return;
    events.push(buildEventFromGroup(day, group, startOfDayMinutes));
    group = [];
    groupCategorySeconds.clear();
    groupProductivitySeconds.clear();
    groupTotalSeconds = 0;
  };

  const visuallyCollidesWithGroup = (entry: WeekCalendarBucketComponent): boolean => {
    if (group.length === 0) return false;
    const groupStartMinute = Math.min(...group.map((component) => component.coveredStartMinute));
    const groupEndMinute = Math.max(...group.map((component) => component.coveredEndMinute));
    const groupVisualEndMinute = groupStartMinute + Math.max(groupEndMinute - groupStartMinute, VISUAL_MERGE_WINDOW_MINUTES);
    return entry.coveredStartMinute < groupVisualEndMinute;
  };

  for (const entry of dominantBuckets) {
    if (group.length > 0) {
      const previous = group[group.length - 1];
      const hasMeaningfulGap = entry.coveredStartMinute - previous.coveredEndMinute >= MEANINGFUL_GAP_MINUTES;
      const groupCategory = topEntry(groupCategorySeconds)?.[0] ?? previous.category;
      const groupProductivity = topEntry(groupProductivitySeconds)?.[0] ?? previous.productivity;
      const categoryChanged = groupCategory !== entry.category;
      const productivityChanged = groupProductivity !== entry.productivity;
      const canStandAlone = groupTotalSeconds >= STANDALONE_EVENT_SECONDS && entry.totalSeconds >= STANDALONE_EVENT_SECONDS;
      const softBreak = (hasMeaningfulGap || categoryChanged || productivityChanged) && !visuallyCollidesWithGroup(entry);
      const hardBreak = (hasMeaningfulGap || categoryChanged) && canStandAlone;
      if (softBreak || hardBreak) flushGroup();
    }

    group.push(entry);
    for (const [category, seconds] of entry.categoryTotals) groupCategorySeconds.set(category, (groupCategorySeconds.get(category) ?? 0) + seconds);
    for (const [productivity, seconds] of entry.productivityTotals) groupProductivitySeconds.set(productivity, (groupProductivitySeconds.get(productivity) ?? 0) + seconds);
    groupTotalSeconds += entry.totalSeconds;
  }
  flushGroup();

  return events.sort((left, right) => left.topMinutes - right.topMinutes || right.durationMinutes - left.durationMinutes);
}

function bucketComponents(bucket: WeekCalendarBucket): WeekCalendarBucketComponent[] {
  const sortedIntervals = bucket.sourceIntervals.slice().sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
  const components: WeekCalendarBucketComponent[] = [];
  let currentIntervals: WeekCalendarSourceInterval[] = [];
  let currentCoveredEndMinute = 0;

  const flushComponent = () => {
    const component = buildComponentFromIntervals(currentIntervals);
    if (component) components.push(component);
    currentIntervals = [];
    currentCoveredEndMinute = 0;
  };

  for (const interval of sortedIntervals) {
    if (currentIntervals.length > 0 && interval.startMinute - currentCoveredEndMinute >= MEANINGFUL_GAP_MINUTES) {
      flushComponent();
    }
    currentIntervals.push(interval);
    currentCoveredEndMinute = Math.max(currentCoveredEndMinute, interval.endMinute);
  }
  flushComponent();

  return components;
}

function buildComponentFromIntervals(intervals: readonly WeekCalendarSourceInterval[]): WeekCalendarBucketComponent | null {
  if (intervals.length === 0) return null;
  const categoryTotals = new Map<ActivityCategory, number>();
  const productivityTotals = new Map<ProductivityLabel, number>();
  const appTotals = new Map<string, number>();
  const identityTotals = new Map<string, WeekCalendarEventIdentity>();
  const sourceTotals = new Map<ClassificationSource, number>();
  const segmentIds = new Set<string>();
  let aiSeconds = 0;
  let totalSeconds = 0;
  let coveredStartMinute = intervals[0].startMinute;
  let coveredEndMinute = intervals[0].endMinute;

  for (const interval of intervals) {
    categoryTotals.set(interval.category, (categoryTotals.get(interval.category) ?? 0) + interval.seconds);
    productivityTotals.set(interval.productivity, (productivityTotals.get(interval.productivity) ?? 0) + interval.seconds);
    appTotals.set(interval.appName, (appTotals.get(interval.appName) ?? 0) + interval.seconds);
    sourceTotals.set(interval.classificationSource, (sourceTotals.get(interval.classificationSource) ?? 0) + interval.seconds);
    addIdentitySeconds(identityTotals, interval);
    segmentIds.add(interval.segmentId);
    totalSeconds += interval.seconds;
    if (interval.aiClassification) aiSeconds += interval.seconds;
    coveredStartMinute = Math.min(coveredStartMinute, interval.startMinute);
    coveredEndMinute = Math.max(coveredEndMinute, interval.endMinute);
  }

  const category = topEntry(categoryTotals)?.[0];
  if (!category) return null;
  return {
    coveredStartMinute,
    coveredEndMinute,
    categoryTotals,
    productivityTotals,
    appTotals,
    identityTotals,
    sourceTotals,
    aiSeconds,
    segmentIds,
    totalSeconds,
    category,
    productivity: topEntry(productivityTotals)?.[0] ?? 'neutral',
    classificationSource: topEntry(sourceTotals)?.[0] ?? 'unknown'
  };
}

function buildEventFromGroup(day: string, group: readonly WeekCalendarBucketComponent[], startOfDayMinutes: number): WeekCalendarEvent {
  const first = group[0];
  const startMinute = Math.min(...group.map((entry) => entry.coveredStartMinute));
  const endMinute = Math.max(...group.map((entry) => entry.coveredEndMinute));
  const totalSeconds = group.reduce((sum, entry) => sum + entry.totalSeconds, 0);
  const categoryTotals = new Map<ActivityCategory, number>();
  const productivityTotals = new Map<ProductivityLabel, number>();
  const appTotals = new Map<string, number>();
  const identityTotals = new Map<string, WeekCalendarEventIdentity>();
  const segmentIds = new Set<string>();

  for (const entry of group) {
    for (const [category, seconds] of entry.categoryTotals) categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + seconds);
    for (const [productivity, seconds] of entry.productivityTotals) productivityTotals.set(productivity, (productivityTotals.get(productivity) ?? 0) + seconds);
    for (const [appName, seconds] of entry.appTotals) appTotals.set(appName, (appTotals.get(appName) ?? 0) + seconds);
    for (const [id, identity] of entry.identityTotals) {
      const current = identityTotals.get(id);
      if (current) {
        current.seconds += identity.seconds;
        current.firstStartMinute = Math.min(current.firstStartMinute, identity.firstStartMinute);
      } else {
        identityTotals.set(id, { ...identity });
      }
    }
    for (const segmentId of entry.segmentIds) segmentIds.add(segmentId);
  }

  const topApps = Array.from(appTotals.entries()).sort((left, right) => right[1] - left[1]);
  const orderedIdentities = Array.from(identityTotals.values()).sort((left, right) =>
    right.seconds - left.seconds || left.firstStartMinute - right.firstStartMinute || left.label.localeCompare(right.label)
  );
  const topCategory = topEntry(categoryTotals);
  const topProductivity = topEntry(productivityTotals);
  const topApp = topApps[0] ?? null;
  const isMixed = Boolean(
    (topCategory && isMeaningfulRemainder(totalSeconds, topCategory[1]))
    || (topProductivity && isMeaningfulRemainder(totalSeconds, topProductivity[1]))
    || (topApp && isMeaningfulRemainder(totalSeconds, topApp[1]))
  );
  const category = topCategory?.[0] ?? first.category;
  const productivity = topProductivity?.[0] ?? first.productivity;
  const categoryName = categoryLabel(category);
  const sessionCount = segmentIds.size;
  const segmentLabel = `${sessionCount} captured segment${sessionCount === 1 ? '' : 's'}`;
  const appName = isMixed ? topAppNamesLabel(topApps, topApp?.[0] ?? categoryName) : topApp?.[0] ?? categoryName;
  const siteDomain = orderedIdentities.find((identity) => identity.siteDomain !== null)?.siteDomain ?? null;
  const startLabel = formatCalendarMinute(startMinute, startOfDayMinutes);
  const endLabel = formatCalendarMinute(endMinute, startOfDayMinutes);

  return {
	    id: `${day}-${category}-${productivity}-${startMinute}-${endMinute}`,
	    appName,
	    siteDomain,
	    category,
    productivity,
    startLabel,
    endLabel,
    detailSummary: isMixed ? segmentLabel : sessionCount <= 1 ? categoryName : segmentLabel,
    detailTitle: [
      `${startLabel}-${endLabel} · ${isMixed ? 'Mixed activity' : categoryName}`,
      `${secondsToLabel(totalSeconds)} across ${segmentLabel}`,
      ...topApps.slice(0, 3).map(([topAppName, seconds]) => `${topAppName} · ${secondsToLabel(seconds)}`)
    ].join('\n'),
    sessionCount,
    isGroupedCluster: group.length > 1 || orderedIdentities.length > 1,
    topMinutes: startMinute,
    durationMinutes: Math.max(1, endMinute - startMinute),
    isShort: endMinute - startMinute <= SHORT_EVENT_MINUTES,
    lane: 0,
    laneCount: 1
  };
}

function assignLanes(events: readonly WeekCalendarEvent[]): WeekCalendarEvent[] {
  const sorted = events.slice().sort((left, right) => left.topMinutes - right.topMinutes || right.durationMinutes - left.durationMinutes);
  let cluster: WeekCalendarEvent[] = [];
  let clusterEnd = -1;
  const assigned: WeekCalendarEvent[] = [];

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const clusteredEvents = cluster.map((event) => {
      const firstOpenLane = laneEnds.findIndex((endMinute) => endMinute <= event.topMinutes);
      const lane = firstOpenLane >= 0 ? firstOpenLane : laneEnds.length;
      laneEnds[lane] = event.topMinutes + event.durationMinutes;
      return { ...event, lane };
    });
    assigned.push(...clusteredEvents.map((event) => ({ ...event, laneCount: laneEnds.length })));
    cluster = [];
  };

  for (const event of sorted) {
    const eventEnd = event.topMinutes + event.durationMinutes;
    if (cluster.length > 0 && event.topMinutes >= clusterEnd) flushCluster();
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, eventEnd);
  }
  flushCluster();

  return assigned;
}

function addIdentitySeconds(identityTotals: Map<string, WeekCalendarEventIdentity>, interval: WeekCalendarSourceInterval): void {
  const currentIdentity = identityTotals.get(interval.identity.id);
  if (currentIdentity) {
    currentIdentity.seconds += interval.seconds;
    currentIdentity.firstStartMinute = Math.min(currentIdentity.firstStartMinute, interval.startMinute);
    return;
  }
  identityTotals.set(interval.identity.id, { ...interval.identity, seconds: interval.seconds, firstStartMinute: interval.startMinute });
}

function topEntry<K>(totals: ReadonlyMap<K, number>): [K, number] | null {
  return Array.from(totals.entries()).sort((left, right) => right[1] - left[1])[0] ?? null;
}

function isMeaningfulRemainder(totalSeconds: number, topSeconds: number): boolean {
  const remainderSeconds = totalSeconds - topSeconds;
  if (remainderSeconds >= MEANINGFUL_INTERRUPTION_SECONDS) return true;
  return remainderSeconds >= MIXED_MINIMUM_SECONDS && totalSeconds > 0 && remainderSeconds / totalSeconds >= MIXED_SHARE_THRESHOLD;
}

function topAppNamesLabel(topApps: readonly [string, number][], fallbackLabel: string): string {
  const appNames = topApps.slice(0, 3).map(([appName]) => appName.trim()).filter(Boolean);
  return appNames.length > 0 ? appNames.join(', ') : fallbackLabel;
}

function categoryLabel(category: ActivityCategory): string {
  return category.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function weekCalendarSegmentLabel(segment: ActivitySegment): string {
  return segment.siteDomain?.trim() || segment.siteTitle?.trim() || segment.appName;
}

function weekCalendarSegmentIdentity(segment: ActivitySegment): WeekCalendarIdentity {
  const appName = segment.appName.trim() || 'Unknown app';
  const bundleId = segment.bundleId?.trim() || null;
  const browserName = segment.browserName?.trim() || null;
  const siteDomain = segment.siteDomain?.trim() || null;
  const siteTitle = segment.siteTitle?.trim() || null;
  const label = siteDomain ?? siteTitle ?? appName;
  const id = siteDomain
    ? `site:${siteDomain.toLowerCase()}`
    : siteTitle
      ? `site-title:${siteTitle.toLowerCase()}:${bundleId ?? appName}`
      : `app:${bundleId ?? appName}`;
  return { id, label, appName, bundleId, browserName, siteDomain, siteTitle };
}

function formatCalendarMinute(logicalMinute: number, startOfDayMinutes: number): string {
  const minuteOfDay = (logicalMinute + startOfDayMinutes) % MINUTES_PER_DAY;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const period = hour < 12 ? 'am' : 'pm';
  const displayHour = hour % 12 || 12;
  return minute === 0 ? `${displayHour}${period}` : `${displayHour}:${String(minute).padStart(2, '0')}${period}`;
}
