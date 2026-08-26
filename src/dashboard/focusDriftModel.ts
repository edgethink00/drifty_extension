import {
  classifyActivityDetailed,
  logicalDayStartMs,
  logicalMinuteOfDay,
  normalizeStartOfDayMinutes,
  type ActivitySegment
} from '../lib/domain';

// Faithful port of drifty_mac's focusDriftChart/focusDriftGeometry, trimmed for the extension.
// Builds 30-minute focus/drift share windows across a logical day and the smooth SVG paths for them.

export const FOCUS_DRIFT_CHART_BOUNDS = { left: 5, right: 95, top: 8, bottom: 92 } as const;
export const FOCUS_DRIFT_MINUTES_PER_DAY = 24 * 60;
export const FOCUS_DRIFT_BUCKET_MINUTES = 30;
export const FOCUS_DRIFT_BUCKET_COUNT = FOCUS_DRIFT_MINUTES_PER_DAY / FOCUS_DRIFT_BUCKET_MINUTES;

export type FocusDriftSourceSummary = {
  label: string;
  seconds: number;
};

export type FocusDriftPoint = {
  id: string;
  label: string;
  bucketStartMinute: number;
  isFuture: boolean;
  focusSeconds: number;
  driftSeconds: number;
  totalSeconds: number;
  focusScore: number;
  driftScore: number;
  topFocusSource: FocusDriftSourceSummary | null;
  topDriftSource: FocusDriftSourceSummary | null;
  x: number;
  focusY: number;
  driftY: number;
};

export type FocusDriftAxisTick = { id: string; label: string; x: number };

export type FocusDriftChart = {
  points: FocusDriftPoint[];
  focusPath: string;
  driftPath: string;
  focusAreaPath: string;
  peakFocusPoint: FocusDriftPoint | null;
  peakDriftPoint: FocusDriftPoint | null;
  focusConsistency: number;
  hasData: boolean;
  isLive: boolean;
  currentX: number | null;
  currentTimeLabel: string | null;
  axisTicks: FocusDriftAxisTick[];
};

export function scaleFocusDriftY(score: number): number {
  const bounded = Math.min(Math.max(score, 0), 100);
  const chartHeight = FOCUS_DRIFT_CHART_BOUNDS.bottom - FOCUS_DRIFT_CHART_BOUNDS.top;
  return FOCUS_DRIFT_CHART_BOUNDS.top + ((100 - bounded) / 100) * chartHeight;
}

const FOCUS_DRIFT_Y_TICKS = [scaleFocusDriftY(100), scaleFocusDriftY(50), scaleFocusDriftY(0)];
export const FOCUS_DRIFT_GRID_PATH = FOCUS_DRIFT_Y_TICKS.map((y) => `M${FOCUS_DRIFT_CHART_BOUNDS.left} ${y}H${FOCUS_DRIFT_CHART_BOUNDS.right}`).join(' ');

function clampX(value: number): number {
  return Math.min(Math.max(value, FOCUS_DRIFT_CHART_BOUNDS.left - 2.5), FOCUS_DRIFT_CHART_BOUNDS.right + 2.5);
}

function clampY(value: number): number {
  return Math.min(Math.max(value, FOCUS_DRIFT_CHART_BOUNDS.top), FOCUS_DRIFT_CHART_BOUNDS.bottom);
}

function buildSlopes(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  const slopes: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const deltaX = next.x - current.x;
    slopes.push(deltaX === 0 ? 0 : (next.y - current.y) / deltaX);
  }
  return slopes;
}

function buildMonotoneTangents(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  const slopes = buildSlopes(points);
  const tangents: number[] = new Array(points.length).fill(0);
  if (points.length === 0) return tangents;
  tangents[0] = slopes[0] ?? 0;
  tangents[points.length - 1] = slopes[slopes.length - 1] ?? 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = slopes[index - 1];
    const next = slopes[index];
    tangents[index] = previous * next <= 0 ? 0 : (previous + next) / 2;
  }
  return tangents;
}

function buildSmoothPath(points: ReadonlyArray<FocusDriftPoint>, yKey: 'focusY' | 'driftY'): string {
  if (points.length === 0) return '';
  const pathPoints = points.map((point) => ({ x: clampX(point.x), y: clampY(point[yKey]) }));
  const first = pathPoints[0];
  if (pathPoints.length === 1) return `M ${first.x} ${first.y}`;
  const tangents = buildMonotoneTangents(pathPoints);
  const parts = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < pathPoints.length; index += 1) {
    const previous = pathPoints[index - 1];
    const current = pathPoints[index];
    const deltaX = current.x - previous.x;
    const c1x = clampX(previous.x + deltaX / 3);
    const c1y = clampY(previous.y + (tangents[index - 1] * deltaX) / 3);
    const c2x = clampX(current.x - deltaX / 3);
    const c2y = clampY(current.y - (tangents[index] * deltaX) / 3);
    parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${current.x} ${current.y}`);
  }
  return parts.join(' ');
}

function clockMinuteForLogicalMinute(logicalMinute: number, startOfDayMinutes: number): number {
  const boundary = normalizeStartOfDayMinutes(startOfDayMinutes);
  const rounded = Math.round(logicalMinute);
  return (((rounded + boundary) % FOCUS_DRIFT_MINUTES_PER_DAY) + FOCUS_DRIFT_MINUTES_PER_DAY) % FOCUS_DRIFT_MINUTES_PER_DAY;
}

export function formatFocusDriftBucketLabel(bucketStartMinute: number, startOfDayMinutes = 0): string {
  const clockMinute = clockMinuteForLogicalMinute(bucketStartMinute, startOfDayMinutes);
  const hour = Math.floor(clockMinute / 60);
  const minute = clockMinute % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function buildAxisTicks(startOfDayMinutes: number): FocusDriftAxisTick[] {
  const chartWidth = FOCUS_DRIFT_CHART_BOUNDS.right - FOCUS_DRIFT_CHART_BOUNDS.left;
  return Array.from({ length: 9 }, (_, index) => {
    const logicalMinute = index * 3 * 60;
    return {
      id: `focus-drift-axis-${logicalMinute}`,
      label: formatFocusDriftBucketLabel(logicalMinute, startOfDayMinutes),
      x: FOCUS_DRIFT_CHART_BOUNDS.left + (logicalMinute / FOCUS_DRIFT_MINUTES_PER_DAY) * chartWidth
    };
  });
}

function segmentSourceLabel(segment: ActivitySegment): string {
  return segment.siteDomain ?? segment.siteTitle ?? segment.appName;
}

function topSource(sources: Map<string, number>): FocusDriftSourceSummary | null {
  let best: FocusDriftSourceSummary | null = null;
  for (const [label, seconds] of sources) {
    if (!best || seconds > best.seconds) best = { label, seconds };
  }
  return best;
}

export function buildFocusDriftChart(
  segments: ActivitySegment[],
  day: string,
  currentMinuteOfDay: number | null,
  startOfDayMinutes = 0
): FocusDriftChart {
  const dayStartMs = logicalDayStartMs(day, startOfDayMinutes);
  const buckets = Array.from({ length: FOCUS_DRIFT_BUCKET_COUNT }, (_, index) => ({
    focusSeconds: 0,
    driftSeconds: 0,
    focusSources: new Map<string, number>(),
    driftSources: new Map<string, number>(),
    bucketStartMinute: index * FOCUS_DRIFT_BUCKET_MINUTES
  }));

  const boundedCurrentMinute = currentMinuteOfDay === null || currentMinuteOfDay === undefined
    ? null
    : Math.min(Math.max(Math.floor(logicalMinuteOfDay(currentMinuteOfDay, startOfDayMinutes)), 0), FOCUS_DRIFT_MINUTES_PER_DAY - 1);
  const currentBucketStartMinute = boundedCurrentMinute === null
    ? null
    : Math.floor(boundedCurrentMinute / FOCUS_DRIFT_BUCKET_MINUTES) * FOCUS_DRIFT_BUCKET_MINUTES;
  const chartWidth = FOCUS_DRIFT_CHART_BOUNDS.right - FOCUS_DRIFT_CHART_BOUNDS.left;
  const currentX = boundedCurrentMinute === null ? null : FOCUS_DRIFT_CHART_BOUNDS.left + (boundedCurrentMinute / FOCUS_DRIFT_MINUTES_PER_DAY) * chartWidth;
  const currentTimeLabel = boundedCurrentMinute === null ? null : formatFocusDriftBucketLabel(boundedCurrentMinute, startOfDayMinutes);
  const isLive = currentX !== null && currentBucketStartMinute !== null;

  for (const segment of segments) {
    const productivity = classifyActivityDetailed(segment).productivity;
    if (productivity !== 'focus' && productivity !== 'drift') continue;
    const label = segmentSourceLabel(segment);
    const segmentStartMs = new Date(segment.startedAt).getTime();
    const segmentEndMs = new Date(segment.endedAt).getTime();

    for (const bucket of buckets) {
      const bucketStartMs = dayStartMs + bucket.bucketStartMinute * 60 * 1000;
      const bucketEndMs = bucketStartMs + FOCUS_DRIFT_BUCKET_MINUTES * 60 * 1000;
      const overlapSeconds = Math.max(0, Math.round((Math.min(segmentEndMs, bucketEndMs) - Math.max(segmentStartMs, bucketStartMs)) / 1000));
      if (overlapSeconds <= 0) continue;
      if (productivity === 'focus') {
        bucket.focusSeconds += overlapSeconds;
        bucket.focusSources.set(label, (bucket.focusSources.get(label) ?? 0) + overlapSeconds);
      } else {
        bucket.driftSeconds += overlapSeconds;
        bucket.driftSources.set(label, (bucket.driftSources.get(label) ?? 0) + overlapSeconds);
      }
    }
  }

  const points: FocusDriftPoint[] = buckets.map((entry) => {
    const totalSeconds = entry.focusSeconds + entry.driftSeconds;
    const focusScore = totalSeconds > 0 ? (entry.focusSeconds / totalSeconds) * 100 : 0;
    const driftScore = totalSeconds > 0 ? (entry.driftSeconds / totalSeconds) * 100 : 0;
    const isFuture = currentBucketStartMinute !== null ? entry.bucketStartMinute > currentBucketStartMinute : false;
    const x = currentBucketStartMinute !== null && currentX !== null && entry.bucketStartMinute === currentBucketStartMinute
      ? currentX
      : FOCUS_DRIFT_CHART_BOUNDS.left + ((entry.bucketStartMinute + FOCUS_DRIFT_BUCKET_MINUTES / 2) / FOCUS_DRIFT_MINUTES_PER_DAY) * chartWidth;
    return {
      id: `${day}-${entry.bucketStartMinute}`,
      label: formatFocusDriftBucketLabel(entry.bucketStartMinute, startOfDayMinutes),
      bucketStartMinute: entry.bucketStartMinute,
      isFuture,
      focusSeconds: entry.focusSeconds,
      driftSeconds: entry.driftSeconds,
      totalSeconds,
      focusScore,
      driftScore,
      topFocusSource: topSource(entry.focusSources),
      topDriftSource: topSource(entry.driftSources),
      x,
      focusY: scaleFocusDriftY(focusScore),
      driftY: scaleFocusDriftY(driftScore)
    };
  });

  const measuredPoints = isLive ? points.filter((point) => !point.isFuture) : points;
  const activePoints = measuredPoints.filter((point) => point.totalSeconds > 0);
  const focusPath = buildSmoothPath(measuredPoints, 'focusY');
  const driftPath = buildSmoothPath(measuredPoints, 'driftY');
  const first = measuredPoints[0];
  const last = measuredPoints[measuredPoints.length - 1];
  const focusAreaPath = first && last && focusPath ? `M ${first.x} ${FOCUS_DRIFT_CHART_BOUNDS.bottom} L ${focusPath.slice(2)} L ${last.x} ${FOCUS_DRIFT_CHART_BOUNDS.bottom} Z` : '';
  const peakFocusPoint = activePoints.reduce<FocusDriftPoint | null>((current, point) => (!current || point.focusScore > current.focusScore ? point : current), null);
  const peakDriftPoint = activePoints.reduce<FocusDriftPoint | null>((current, point) => (!current || point.driftScore > current.driftScore ? point : current), null);
  const totalFocus = points.reduce((sum, point) => sum + point.focusSeconds, 0);
  const totalAll = points.reduce((sum, point) => sum + point.totalSeconds, 0);

  return {
    points,
    focusPath,
    driftPath,
    focusAreaPath,
    peakFocusPoint,
    peakDriftPoint,
    focusConsistency: totalAll > 0 ? Math.round((totalFocus / totalAll) * 100) : 0,
    hasData: activePoints.length > 0,
    isLive,
    currentX,
    currentTimeLabel,
    axisTicks: buildAxisTicks(startOfDayMinutes)
  };
}
