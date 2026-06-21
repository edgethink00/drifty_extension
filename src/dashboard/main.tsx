import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import {
  FLOW_INTERVAL_OPTIONS,
  buildAppUsageSummaries,
  classifyActivityDetailed,
  buildCategoryDurations,
  buildFlowBlocks,
  buildProductivityDurations,
  logicalDayIsoDateForDate,
  logicalMinuteOfDay,
  secondsToLabel,
  shiftIsoDate,
  todayIsoDate,
  totalDurationSeconds,
  type ActivitySegment,
  type ActivityCategory,
  type CategoryDuration,
  type FlowBlock,
  type FlowIntervalMinutes,
  type ProductivityDuration,
  type ProductivityLabel
} from '../lib/domain';
import {
  browserTrackerClient,
  DRIFTY_BROWSER_SETTINGS_DEFAULTS,
  DRIFTY_CATEGORY_LIST,
  DRIFTY_CATEGORY_METADATA,
  DRIFTY_PRODUCTIVITY_METADATA,
  type DriftyBrowserCategory,
  type DriftyBrowserSettings,
  type DriftyStatsSummary,
  type DriftyWeeklyStatsSummary
} from '../lib/drifty';
import { formatDateLabel, formatDuration, pluralize } from '../shared/format';
import { EmptyState, Metric, Panel, PrivacyPills, Sidebar, StatusBox, ToneBars, type ToneItem, type NavItem } from '../shared/SurfacePrimitives';
import { mountSurface } from '../shared/mount';
import { ClassificationView } from './ClassificationView';
import { DateNavigator } from './DateNavigator';
import { AppGlyph, SiteFavicon } from './IdentityIcon';
import { HistoryView } from './HistoryView';
import { WeekCalendarView } from './WeekCalendarView';

document.title = 'Drifty | Dashboard';

type DashboardData = {
  today: DriftyStatsSummary;
  week: DriftyWeeklyStatsSummary;
  day: string;
  currentSession: ActivitySegment | null;
  settings: DriftyBrowserSettings & { legacy: unknown };
  categories: DriftyBrowserCategory[];
};
type TabKey = 'day' | 'week' | 'classification' | 'history' | 'settings';
type AppIconMap = Record<string, string | null>;
type SegmentWithIconSource = ActivitySegment & {
  appIconSrc?: string | null;
  iconSrc?: string | null;
  favIconUrl?: string | null;
};
type TopActivitySummary = DriftyStatsSummary['topActivities'][number];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES_PER_DAY = 24 * 60;
const BASE_FLOW_CELL_INTERVAL_MINUTES = 3;
const FLOW_CELL_BASE_MIN_HEIGHT_REM = 0.5;
const FLOW_BREAKDOWN_CELL_BASE_MIN_HEIGHT_REM = 0.76;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 40;
function defaultBrowserAppIconSrc(): string | null {
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/icon128.png') : null;
}

type FlowHoverState = {
  block: FlowBlock;
  x: number;
  y: number;
};

type FlowCategoryGroup = {
  productivity: ProductivityLabel;
  categories: ActivityCategory[];
};

type FlowLegendActivityBreakdown = {
  appName: string;
  bundleId?: string | null;
  browserName?: string | null;
  siteDomain?: string | null;
  siteTitle?: string | null;
  totalSeconds: number;
};

type FlowLegendHoverState = {
  label: string;
  categories: ActivityCategory[];
  appBreakdown: FlowLegendActivityBreakdown[];
  x: number;
  y: number;
};

const FLOW_CATEGORY_GROUPS: FlowCategoryGroup[] = [
  { productivity: 'focus', categories: ['workspace', 'learning'] },
  { productivity: 'neutral', categories: ['communication', 'music', 'utility', 'unknown'] },
  { productivity: 'drift', categories: ['entertainment', 'social_media', 'shopping', 'game'] }
];

const FLOW_BREAKDOWN_PRODUCTIVITY_ORDER: ProductivityLabel[] = ['focus', 'drift', 'neutral'];

type LoadState = {
  status: 'loading' | 'ready' | 'error';
  data: DashboardData | null;
  error: string | null;
};

type CompactClassificationBreakdownRow = {
  appName: string;
  bundleId?: string | null;
  browserName?: string | null;
  siteDomain?: string | null;
  siteTitle?: string | null;
  totalSeconds: number;
};

type CompactClassificationHoverState = {
  label: string;
  durationLabel: string;
  shareLabel: string;
  dotClassName: string;
  color: string;
  appBreakdown: CompactClassificationBreakdownRow[];
  x: number;
  y: number;
};

type FixedHoverPosition = {
  left: number;
  top: number;
};

const navSections: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'Dashboard',
    items: [
      { id: 'day', label: 'Today', icon: 'home', detail: 'Daily view' },
      { id: 'week', label: 'Week', icon: 'calendar', detail: 'Calendar week' }
    ]
  },
  {
    section: 'Workspace',
    items: [
      { id: 'classification', label: 'Classification', icon: 'classify', detail: 'Categories' },
      { id: 'history', label: 'History', icon: 'history', detail: 'Browser history' },
      { id: 'settings', label: 'Settings', icon: 'settings', detail: 'Preferences' }
    ]
  }
];

const categoryToneColor: Record<DriftyBrowserCategory['id'], string> = {
  workspace: 'var(--category-workspace)',
  learning: 'var(--category-learning)',
  communication: 'var(--category-communication)',
  music: 'var(--category-music)',
  game: 'var(--category-game)',
  social_media: 'var(--category-social-media)',
  entertainment: 'var(--category-entertainment)',
  shopping: 'var(--category-shopping)',
  utility: 'var(--category-utility)',
  unknown: 'var(--category-unknown)'
};

const productivityToneColor = {
  focus: 'var(--focus)',
  neutral: 'var(--neutral)',
  drift: 'var(--drift)'
} as const;

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'am' : 'pm';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${period}`;
}

function normalizeStartOfDayMinutes(minutes?: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(MINUTES_PER_DAY - 1, Math.max(0, Math.round(minutes ?? 0)));
}

function clockHourForLogicalHour(logicalHour: number, startOfDayMinutes: number): number {
  return Math.floor((logicalHour * 60 + startOfDayMinutes) / 60) % 24;
}

function minuteOfDayForCell(logicalHour: number, minuteOffset: number, startOfDayMinutes: number): number {
  return (logicalHour * 60 + minuteOffset + startOfDayMinutes) % MINUTES_PER_DAY;
}

function formatMinuteOfDay(minuteOfDay: number): string {
  const normalized = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function formatBlockTime(block: FlowBlock): string {
  return formatMinuteOfDay(block.minuteOfDay);
}

function formatBlockEndTime(block: FlowBlock, intervalMinutes: FlowIntervalMinutes): string {
  return formatMinuteOfDay(block.minuteOfDay + intervalMinutes);
}

function flowSubtitle(block: FlowBlock): string {
  if (block.siteTitle) return block.siteTitle;
  if (block.windowTitle) return block.windowTitle;
  if (block.siteDomain) return block.siteDomain;
  return 'App focus block without window detail.';
}

function blockDisplayName(block: FlowBlock): string {
  return block.siteDomain ?? block.siteTitle ?? block.appName;
}

function blockContextLabel(block: FlowBlock, intervalMinutes: FlowIntervalMinutes): string {
  const timeLabel = `${formatBlockTime(block)}–${formatBlockEndTime(block, intervalMinutes)} · ${secondsToLabel(block.durationSeconds)}`;
  if (!block.siteDomain) return timeLabel;
  return block.browserName ? `${block.browserName} · ${timeLabel}` : timeLabel;
}

function categoryLabel(category: ActivityCategory): string {
  return DRIFTY_CATEGORY_METADATA[category].label;
}

function productivityLabel(productivity: ProductivityLabel): string {
  return DRIFTY_PRODUCTIVITY_METADATA[productivity].label;
}

function buildLegendActivityBreakdown(blocks: FlowBlock[], categories: ActivityCategory[]): FlowLegendActivityBreakdown[] {
  const categorySet = new Set<ActivityCategory>(categories);
  const totals = new Map<string, FlowLegendActivityBreakdown>();

  for (const block of blocks) {
    if (!categorySet.has(block.category)) continue;
    const label = blockDisplayName(block);
    const key = block.siteDomain ? `site:${block.siteDomain}` : block.siteTitle ? `title:${block.siteTitle}` : `app:${block.bundleId ?? block.appName}`;
    const existing = totals.get(key) ?? {
      appName: label,
      bundleId: block.siteDomain || block.siteTitle ? null : block.bundleId ?? null,
      browserName: block.browserName ?? null,
      siteDomain: block.siteDomain ?? null,
      siteTitle: block.siteTitle ?? null,
      totalSeconds: 0
    };
    existing.totalSeconds += block.durationSeconds;
    totals.set(key, existing);
  }

  return Array.from(totals.values())
    .sort((left, right) => right.totalSeconds - left.totalSeconds || left.appName.localeCompare(right.appName))
    .slice(0, 4);
}

function cellTitle(block: FlowBlock, intervalMinutes: FlowIntervalMinutes): string {
  const detail = block.siteTitle ?? block.windowTitle ?? block.siteDomain ?? 'No window title captured';
  return [
    `${blockDisplayName(block)} · ${categoryLabel(block.category)} · ${productivityLabel(block.productivity)}`,
    detail,
    `Time block: ${formatBlockTime(block)}–${formatBlockEndTime(block, intervalMinutes)}`,
    `Duration: ${secondsToLabel(block.durationSeconds)}`
  ].join('\n');
}

function getViewportSafeHoverPosition(x: number, y: number, width: number, height: number): FixedHoverPosition {
  const margin = 16;
  const offset = 16;
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const maxLeft = viewportWidth - width - margin;
  const maxTop = viewportHeight - height - margin;
  const preferredLeft = x + offset;
  const preferredTop = y + offset;
  const flippedLeft = x - width - offset;
  const flippedTop = y - height - offset;
  const left = preferredLeft > maxLeft && flippedLeft >= margin ? flippedLeft : preferredLeft;
  const top = preferredTop > maxTop && flippedTop >= margin ? flippedTop : preferredTop;

  return {
    left: Math.min(Math.max(margin, left), Math.max(margin, maxLeft)),
    top: Math.min(Math.max(margin, top), Math.max(margin, maxTop))
  };
}

function useViewportSafeHoverPosition(hover: { x: number; y: number }, dependencies: unknown[]): [FixedHoverPosition, React.RefObject<HTMLDivElement>] {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FixedHoverPosition>(() => getViewportSafeHoverPosition(hover.x, hover.y, 0, 0));

  useLayoutEffect(() => {
    function updatePosition() {
      const bounds = cardRef.current?.getBoundingClientRect();
      const nextPosition = getViewportSafeHoverPosition(hover.x, hover.y, bounds?.width ?? 0, bounds?.height ?? 0);
      setPosition((currentPosition) => (
        currentPosition.left === nextPosition.left && currentPosition.top === nextPosition.top ? currentPosition : nextPosition
      ));
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [hover.x, hover.y, ...dependencies]);

  return [position, cardRef];
}

function productivityDotClassName(productivity: ProductivityLabel): string {
  return `productivity-dot--${productivity}`;
}

function categoryDotClassName(category: ActivityCategory): string {
  return `category-dot--${category}`;
}

function classificationSourceLabel(source?: string | null, ai?: boolean | null): string {
  if (ai || source === 'llm') return 'AI classified';
  if (source === 'rule') return 'Custom rule';
  if (source === 'domain-db' || source === 'app-db' || source === 'youtube') return 'Predefined rule';
  if (source === 'context') return 'Context rule';
  if (source === 'fallback') return 'Fallback';
  if (source === 'manual') return 'Manual';
  if (source === 'stored') return 'Stored';
  return 'Unclassified rule';
}

function ClassificationSourcePill({ source, ai }: { source?: string | null; ai?: boolean | null }) {
  const label = classificationSourceLabel(source, ai);
  return <span className={`classification-source-pill${ai ? ' classification-source-pill--ai' : ''}`}>{label}</span>;
}

function dashboardDayIsoDate(summary: DashboardData['today']): string {
  const legacy = summary.legacy;
  if (legacy && typeof legacy === 'object' && 'date' in legacy) {
    const date = (legacy as { date?: unknown }).date;
    if (typeof date === 'string' && date.length > 0) return date;
  }

  return todayIsoDate();
}

function currentMinuteOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function dashboardStartOfDayMinutes(): number {
  return 4 * 60;
}

async function loadDashboardData(selectedDay?: string) {
  const startOfDayMinutes = dashboardStartOfDayMinutes();
  const logicalToday = selectedDay ?? logicalDayIsoDateForDate(new Date(), startOfDayMinutes);
  const nextCalendarDay = shiftIsoDate(logicalToday, 1);
  const realToday = logicalDayIsoDateForDate(new Date(), startOfDayMinutes);
  const [logicalStartStats, logicalEndStats, week, currentSession, settings, categories] = await Promise.all([
    browserTrackerClient.getDateStats(logicalToday),
    browserTrackerClient.getDateStats(nextCalendarDay),
    browserTrackerClient.getWeeklyStats(),
    logicalToday === realToday ? browserTrackerClient.getCurrentSession().catch(() => null) : Promise.resolve(null),
    browserTrackerClient.getSettings().catch(() => ({ ...DRIFTY_BROWSER_SETTINGS_DEFAULTS, legacy: null })),
    browserTrackerClient.getCategories().catch(() => DRIFTY_CATEGORY_LIST.map((category) => ({ ...category, legacyKeys: [] } as DriftyBrowserCategory)))
  ]);
  const today = buildLogicalDaySummary(logicalToday, startOfDayMinutes, dedupeActivitySegments([
    ...logicalStartStats.segments,
    ...logicalEndStats.segments
  ]));

  return { today, week, day: logicalToday, currentSession, settings, categories };
}

function dedupeActivitySegments(segments: ActivitySegment[]): ActivitySegment[] {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = segment.id || `${segment.startedAt}|${segment.endedAt}|${segment.appName}|${segment.siteDomain ?? ''}|${segment.siteUrl ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildLogicalDaySummary(day: string, startOfDayMinutes: number, segments: ActivitySegment[]): DriftyStatsSummary {
  const logicalSegments = segments
    .map((segment) => clipSegmentToLogicalDay(segment, day, startOfDayMinutes))
    .filter((segment): segment is ActivitySegment => segment !== null);

  return {
    totalSeconds: totalDurationSeconds(logicalSegments),
    categoryDurations: buildCategoryDurations(logicalSegments),
    productivityDurations: buildProductivityDurations(logicalSegments),
    topActivities: buildAppUsageSummaries(logicalSegments, { limit: 5 }),
    segments: logicalSegments,
    legacy: { date: day, source: 'logical-day', startOfDayMinutes }
  };
}

function logicalDayBounds(day: string, startOfDayMinutes: number): { startMs: number; endMs: number } {
  const [year, month, date] = day.split('-').map(Number);
  const start = new Date(year, month - 1, date, 0, 0, 0, 0).getTime() + normalizeStartOfDayMinutes(startOfDayMinutes) * 60 * 1000;
  return { startMs: start, endMs: start + MINUTES_PER_DAY * 60 * 1000 };
}

function clipSegmentToLogicalDay(segment: ActivitySegment, day: string, startOfDayMinutes: number): ActivitySegment | null {
  const start = new Date(segment.startedAt).getTime();
  const end = new Date(segment.endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const bounds = logicalDayBounds(day, startOfDayMinutes);
  const clippedStart = Math.max(start, bounds.startMs);
  const clippedEnd = Math.min(end, bounds.endMs);
  if (clippedEnd <= clippedStart) return null;

  return {
    ...segment,
    startedAt: new Date(clippedStart).toISOString(),
    endedAt: new Date(clippedEnd).toISOString(),
    durationSeconds: Math.max(0, Math.round((clippedEnd - clippedStart) / 1000))
  };
}

function iconSrcFromSegment(segment: SegmentWithIconSource): string | null {
  return segment.appIconSrc ?? segment.iconSrc ?? segment.favIconUrl ?? null;
}

function buildAppIconMap(segments: ActivitySegment[]): AppIconMap {
  const appIcons: AppIconMap = {};

  for (const segment of segments) {
    const iconSrc = iconSrcFromSegment(segment) ?? defaultBrowserAppIconSrc();
    if (!iconSrc) continue;

    if (segment.bundleId) appIcons[segment.bundleId] = iconSrc;
    appIcons[segment.appName] = iconSrc;
    if (segment.browserName) appIcons[segment.browserName] = iconSrc;
  }

  return appIcons;
}

function productivityItems(data: DashboardData['today'] | DashboardData['week']): ToneItem[] {
  return data.productivityDurations.map((item) => ({
    label: DRIFTY_PRODUCTIVITY_METADATA[item.productivity].label,
    seconds: item.totalSeconds,
    ratio: item.ratio,
    color: productivityToneColor[item.productivity],
    meta: pluralize(item.segments, 'segment')
  }));
}

function segmentClassificationDetail(segment: ActivitySegment) {
  return classifyActivityDetailed(segment);
}

function segmentCategory(segment: ActivitySegment): ActivityCategory {
  return segmentClassificationDetail(segment).category;
}

function segmentProductivity(segment: ActivitySegment): ProductivityLabel {
  return segmentClassificationDetail(segment).productivity;
}

function segmentClassificationSource(segment: ActivitySegment): { source: string | null; ai: boolean; label: string } {
  const detail = segmentClassificationDetail(segment);
  const ai = detail.source === 'llm';
  return { source: detail.source, ai, label: classificationSourceLabel(detail.source, ai) };
}

function topActivityMatchesSegment(activity: TopActivitySummary, segment: ActivitySegment): boolean {
  if (activity.usageKind === 'site') {
    if (activity.siteDomain && segment.siteDomain) return activity.siteDomain.toLowerCase() === segment.siteDomain.toLowerCase();
    if (activity.siteTitle && segment.siteTitle) return activity.siteTitle === segment.siteTitle;
    return false;
  }

  if (activity.bundleId && segment.bundleId) return activity.bundleId === segment.bundleId;
  return activity.appName === segment.appName;
}

function topActivitySegments(activity: TopActivitySummary, segments: ActivitySegment[]): ActivitySegment[] {
  return segments.filter((segment) => topActivityMatchesSegment(activity, segment));
}

function topActivityDetailLabel(activity: TopActivitySummary, segments: ActivitySegment[]): string {
  const matchedSegments = topActivitySegments(activity, segments);
  const leadingSegment = matchedSegments
    .sort((left, right) => right.durationSeconds - left.durationSeconds)
    [0];

  if (!leadingSegment) return 'Local source detail pending';

  const source = segmentClassificationSource(leadingSegment);
  return `${categoryLabel(segmentCategory(leadingSegment))} · ${productivityLabel(segmentProductivity(leadingSegment))} · ${source.label}`;
}

function SettingsFlag({ label, detail, enabled }: { label: string; detail: string; enabled: boolean }) {
  return (
    <div className="setting-row">
      <div className="stack-tight">
        <strong>{label}</strong>
        <span className="muted">{detail}</span>
      </div>
      <span className="pill">{enabled ? 'On' : 'Off'}</span>
    </div>
  );
}

function FlowChartView({
  blocks,
  currentMinuteOfDay: currentMinute,
  intervalMinutes = 3,
  onIntervalChange,
  startOfDayMinutes = 0,
  appIcons = {}
}: {
  blocks: FlowBlock[];
  currentMinuteOfDay?: number | null;
  intervalMinutes?: FlowIntervalMinutes;
  onIntervalChange?: (intervalMinutes: FlowIntervalMinutes) => void;
  startOfDayMinutes?: number;
  appIcons?: Record<string, string | null>;
}) {
  const [hoveredBlock, setHoveredBlock] = useState<FlowHoverState | null>(null);
  const [hoveredLegend, setHoveredLegend] = useState<FlowLegendHoverState | null>(null);
  const rowMinuteOffsets = useMemo(
    () => Array.from({ length: 60 / intervalMinutes }, (_, index) => index * intervalMinutes),
    [intervalMinutes]
  );
  const boundaryMinutes = normalizeStartOfDayMinutes(startOfDayMinutes);
  const currentLogicalMinute = currentMinute !== null && currentMinute !== undefined ? logicalMinuteOfDay(currentMinute, boundaryMinutes) : null;
  const currentHourIndex = currentLogicalMinute !== null ? Math.floor(currentLogicalMinute / 60) : null;
  const currentMinuteOffset = currentLogicalMinute !== null
    ? Math.floor((currentLogicalMinute % 60) / intervalMinutes) * intervalMinutes
    : null;
  const blockByCell = useMemo(() => {
    const next = new Map<string, FlowBlock>();
    for (const block of blocks) next.set(`${block.minuteOfDay}`, block);
    return next;
  }, [blocks]);
  const chartStyle: CSSProperties & Record<'--flow-cell-min-height' | '--flow-breakdown-cell-min-height', string> = {
    '--flow-cell-min-height': `${(FLOW_CELL_BASE_MIN_HEIGHT_REM * intervalMinutes) / BASE_FLOW_CELL_INTERVAL_MINUTES}rem`,
    '--flow-breakdown-cell-min-height': `${(FLOW_BREAKDOWN_CELL_BASE_MIN_HEIGHT_REM * intervalMinutes) / BASE_FLOW_CELL_INTERVAL_MINUTES}rem`
  };
  const legendBreakdowns = useMemo(() => {
    const map = new Map<string, FlowLegendActivityBreakdown[]>();
    for (const group of FLOW_CATEGORY_GROUPS) {
      map.set(group.productivity, buildLegendActivityBreakdown(blocks, group.categories));
      for (const category of group.categories) {
        map.set(category, buildLegendActivityBreakdown(blocks, [category]));
      }
    }
    return map;
  }, [blocks]);

  const showLegendHover = (event: MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, label: string, categories: ActivityCategory[]) => setHoveredLegend({
    label,
    categories,
    appBreakdown: legendBreakdowns.get(categories.length === 1 ? categories[0] : label.toLowerCase()) ?? [],
    x: (event as MouseEvent<HTMLElement>).clientX ?? 0,
    y: (event as MouseEvent<HTMLElement>).clientY ?? 0
  });
  if (blocks.length === 0) return null;

  return (
    <section className="flow-chart-card" aria-label={`${intervalMinutes}-minute flow chart`} data-flow-interval={intervalMinutes} style={chartStyle}>
      <div className="flow-chart-head">
        <div>
          <span className="label-mono">flow chart</span>
          <p className="flow-chart-copy">{intervalMinutes}-minute cells show the dominant app or site in each block; tracked totals live in Time breakdown.</p>
        </div>
        <div className="flow-chart-head__actions">
          {onIntervalChange ? (
            <div className="seg flow-interval-control" aria-label="Flow chart interval">
              {FLOW_INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === intervalMinutes ? 'on' : undefined}
                  aria-pressed={option === intervalMinutes}
                  onClick={() => onIntervalChange(option)}
                >
                  {option}m
                </button>
              ))}
            </div>
          ) : null}
          <div className="flow-chart-legend" aria-label="Flow chart tones">
            {FLOW_CATEGORY_GROUPS.map((group) => (
              <span className="flow-chart-legend__group" key={group.productivity}>
                <button
                  type="button"
                  className="flow-chart-legend__parent"
                  onMouseEnter={(event) => showLegendHover(event, productivityLabel(group.productivity), group.categories)}
                  onMouseLeave={() => setHoveredLegend(null)}
                  onFocus={(event) => showLegendHover(event, productivityLabel(group.productivity), group.categories)}
                  onBlur={() => setHoveredLegend(null)}
                  title={`${productivityLabel(group.productivity)} categories`}
                >
                  {productivityLabel(group.productivity)}
                </button>
                <span className="flow-chart-legend__categories" aria-label={`${productivityLabel(group.productivity)} categories`}>
                  {group.categories.map((category) => (
                    <button
                      type="button"
                      aria-label={categoryLabel(category)}
                      className={`flow-chart-legend__dot flow-chart-legend__dot--${category}`}
                      key={category}
                      onMouseEnter={(event) => showLegendHover(event, categoryLabel(category), [category])}
                      onMouseLeave={() => setHoveredLegend(null)}
                      onFocus={(event) => showLegendHover(event, categoryLabel(category), [category])}
                      onBlur={() => setHoveredLegend(null)}
                      title={categoryLabel(category)}
                    />
                  ))}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flow-chart-body">
        <div className="flow-chart-hours" aria-hidden="true">
          <span />
          {HOURS.map((hour) => {
            const clockHour = clockHourForLogicalHour(hour, boundaryMinutes);
            return (
              <span className={hour === currentHourIndex ? 'flow-chart-hour--now' : undefined} key={hour}>
                {hour === currentHourIndex || hour % 3 === 0 ? formatHourLabel(clockHour) : ''}
              </span>
            );
          })}
        </div>
        <div className="flow-chart-grid">
        {rowMinuteOffsets.map((minuteOffset) => {
          const isCurrentMinuteRow = minuteOffset === currentMinuteOffset;
          const nearestLabelMinuteOffset = currentMinuteOffset !== null && currentMinuteOffset + intervalMinutes < 60
            ? currentMinuteOffset + intervalMinutes
            : currentMinuteOffset;
          const isCurrentTimeLabelRow = minuteOffset === nearestLabelMinuteOffset;
          const isTerminalCurrentMinuteRow = isCurrentMinuteRow && minuteOffset + intervalMinutes >= 60;
          const rowStyle = isCurrentMinuteRow && currentHourIndex !== null
            ? { '--flow-current-hour': currentHourIndex } as CSSProperties & Record<'--flow-current-hour', number>
            : undefined;

          return (
            <div
              className={`flow-chart-row${isCurrentMinuteRow ? ' flow-chart-row--now' : ''}${isTerminalCurrentMinuteRow ? ' flow-chart-row--now-terminal' : ''}${isCurrentTimeLabelRow ? ' flow-chart-row--time-label' : ''}`}
              key={minuteOffset}
              style={rowStyle}
            >
              <div className="flow-chart-row-label">:{`${minuteOffset}`.padStart(2, '0')}</div>
              {HOURS.map((hour) => {
                const minuteOfDay = minuteOfDayForCell(hour, minuteOffset, boundaryMinutes);
                const block = blockByCell.get(`${minuteOfDay}`);
                const isCurrentHourCell = hour === currentHourIndex && minuteOffset === currentMinuteOffset;
                if (!block) {
                  return (
                    <span
                      className={`flow-cell flow-cell--empty${isCurrentHourCell ? ' flow-cell--now-hour' : ''}`}
                      key={minuteOfDay}
                      aria-hidden="true"
                    />
                  );
                }

                return (
                  <button
                    className={`flow-cell flow-cell--${block.category}${isCurrentHourCell ? ' flow-cell--now-hour' : ''}`}
                    key={block.minuteOfDay}
                    type="button"
                    aria-label={cellTitle(block, intervalMinutes).replace(/\n/g, ', ')}
                    onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => setHoveredBlock({ block, x: event.clientX, y: event.clientY })}
                    onMouseLeave={() => setHoveredBlock(null)}
                    onFocus={(event: React.FocusEvent<HTMLButtonElement>) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setHoveredBlock({ block, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                    }}
                    onBlur={() => setHoveredBlock(null)}
                  >
                    <span className="flow-cell__mark" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>

      {hoveredBlock ? <FlowHoverCard hover={hoveredBlock} intervalMinutes={intervalMinutes} appIcons={appIcons} /> : null}
      {hoveredLegend ? <FlowLegendHoverCard hover={hoveredLegend} appIcons={appIcons} /> : null}
    </section>
  );
}

function FlowLegendHoverCard({ hover, appIcons }: { hover: FlowLegendHoverState; appIcons: Record<string, string | null> }) {
  const [position, cardRef] = useViewportSafeHoverPosition(hover, [hover.appBreakdown, hover.categories, hover.label]);

  return (
    <div ref={cardRef} className="flow-hover-card category-hover-card" style={position}>
      <div className="category-hover-card__head">
        <strong>{hover.label}</strong>
        <span>{hover.categories.map(categoryLabel).join(', ')}</span>
      </div>
      <div className="category-hover-card__apps">
        {hover.appBreakdown.length > 0 ? hover.appBreakdown.map((item) => {
          const label = item.siteDomain ?? item.siteTitle ?? item.appName;
          const iconSrc = appIcons[item.bundleId ?? item.appName] ?? null;
          return (
            <div className="category-hover-card__app" key={`${item.siteDomain ?? item.siteTitle ?? item.bundleId ?? item.appName}`}>
              <span className="usage-identity-icon usage-identity-icon--sm">
                {item.siteDomain ? <SiteFavicon domain={item.siteDomain} size={20} fallbackIconSrc={iconSrc} /> : <AppGlyph appName={label} size="sm" iconSrc={item.siteTitle ? null : iconSrc} />}
              </span>
              <span>{label}</span>
              <strong>{secondsToLabel(item.totalSeconds)}</strong>
            </div>
          );
        }) : <span className="category-hover-card__empty">No app breakdown yet.</span>}
      </div>
    </div>
  );
}

function FlowHoverCard({ hover, intervalMinutes, appIcons }: { hover: FlowHoverState; intervalMinutes: FlowIntervalMinutes; appIcons: Record<string, string | null> }) {
  const { block } = hover;
  const displayName = blockDisplayName(block);
  const iconSrc = appIcons[block.bundleId ?? block.appName] ?? null;
  const [position, cardRef] = useViewportSafeHoverPosition(hover, [block, displayName, intervalMinutes]);

  return (
    <div ref={cardRef} className="flow-hover-card" style={position}>
      <div className="flow-hover-card__top">
        {block.siteDomain ? <SiteFavicon domain={block.siteDomain} size={24} fallbackIconSrc={iconSrc} /> : <AppGlyph appName={displayName} size="sm" iconSrc={iconSrc} />}
        <div>
          <strong>{displayName}</strong>
          <span>{blockContextLabel(block, intervalMinutes)}</span>
        </div>
      </div>
      <p>{categoryLabel(block.category)} · {productivityLabel(block.productivity)} · {flowSubtitle(block)}</p>
      <ClassificationSourcePill source={block.classificationSource} ai={block.aiClassification} />
      {block.siteDomain ? (
        <span className="segment-site-pill flow-hover-card__site">
          <SiteFavicon domain={block.siteDomain} size={14} fallbackIconSrc={iconSrc} />
          {block.siteDomain}
        </span>
      ) : null}
    </div>
  );
}

function formatCompactDurationFromSeconds(totalSeconds: number): string {
  return secondsToLabel(totalSeconds);
}

function formatCompactBarLabel<TEntry extends { totalSeconds: number; ratio: number }>(title: string, entries: TEntry[], getLabel: (entry: TEntry) => string): string {
  const parts = entries.map((entry) => `${getLabel(entry)} ${formatCompactDurationFromSeconds(entry.totalSeconds)} ${Math.round(entry.ratio * 100)}%`);
  return `${title} classification: ${parts.join(', ')}`;
}

function buildCompactClassificationBreakdown(blocks: FlowBlock[], matchesSegment: (block: FlowBlock) => boolean): CompactClassificationBreakdownRow[] {
  const totals = new Map<string, CompactClassificationBreakdownRow>();

  for (const block of blocks) {
    if (!matchesSegment(block)) continue;
    const label = block.siteDomain ?? block.siteTitle ?? block.appName;
    const key = block.siteDomain ? `site:${block.siteDomain}` : block.siteTitle ? `title:${block.siteTitle}` : `app:${block.bundleId ?? block.appName}`;
    const existing = totals.get(key) ?? {
      appName: label,
      bundleId: block.siteDomain || block.siteTitle ? null : block.bundleId ?? null,
      browserName: block.browserName ?? null,
      siteDomain: block.siteDomain ?? null,
      siteTitle: block.siteTitle ?? null,
      totalSeconds: 0
    };
    existing.totalSeconds += block.durationSeconds;
    totals.set(key, existing);
  }

  return Array.from(totals.values())
    .sort((left, right) => right.totalSeconds - left.totalSeconds || left.appName.localeCompare(right.appName))
    .slice(0, 4);
}

function FlowCompactSplitChart({
  categoryEntries,
  productivityEntries,
  totalSeconds,
  flowBlocks,
  appIcons = {}
}: {
  categoryEntries: CategoryDuration[];
  productivityEntries: ProductivityDuration[];
  totalSeconds: number;
  flowBlocks: FlowBlock[];
  appIcons?: Record<string, string | null>;
}) {
  const orderedProductivityEntries = FLOW_BREAKDOWN_PRODUCTIVITY_ORDER
    .map((productivity) => productivityEntries.find((entry) => entry.productivity === productivity))
    .filter((entry): entry is ProductivityDuration => Boolean(entry));
  const activeCategoryEntries = categoryEntries
    .filter((entry) => entry.totalSeconds > 0)
    .slice()
    .sort((left, right) => right.totalSeconds - left.totalSeconds);

  return (
    <section className="flow-compact-split-chart" aria-label="Compact flow classification chart">
      <CompactProductivityCircleChart entries={orderedProductivityEntries} totalSeconds={totalSeconds} flowBlocks={flowBlocks} appIcons={appIcons} />
      <CompactClassificationBar<CategoryDuration>
        title="Categories"
        ariaLabel="Category compact classification"
        entries={activeCategoryEntries}
        totalSeconds={totalSeconds}
        getKey={(entry) => entry.category}
        getLabel={(entry) => categoryLabel(entry.category)}
        getColor={(entry) => categoryToneColor[entry.category]}
        getDotClassName={(entry) => categoryDotClassName(entry.category)}
        getAppBreakdown={(entry) => buildCompactClassificationBreakdown(flowBlocks, (block) => block.category === entry.category)}
        appIcons={appIcons}
        visibleLimit={5}
      />
    </section>
  );
}

function CompactProductivityCircleChart({ entries, totalSeconds, flowBlocks, appIcons }: { entries: ProductivityDuration[]; totalSeconds: number; flowBlocks: FlowBlock[]; appIcons: Record<string, string | null> }) {
  const [hoveredSegment, setHoveredSegment] = useState<CompactClassificationHoverState | null>(null);
  const activeEntries = entries.filter((entry) => entry.totalSeconds > 0 && entry.ratio > 0);
  const summaryEntries = activeEntries.length > 0 ? activeEntries : entries;
  const focusEntry = entries.find((entry) => entry.productivity === 'focus');
  const focusSeconds = focusEntry?.totalSeconds ?? 0;
  const focusPercent = totalSeconds > 0 ? Math.round((focusSeconds / totalSeconds) * 100) : 0;
  const circleLabel = formatCompactBarLabel('Productivity', entries, (entry) => productivityLabel(entry.productivity));
  let cursor = 0;
  const gap = activeEntries.length > 1 ? 1.6 : 0;
  const circleSegments = activeEntries.map((entry) => {
    const dash = Math.max(0, entry.ratio * DONUT_CIRCUMFERENCE - gap);
    const offset = -(cursor * DONUT_CIRCUMFERENCE);
    cursor += entry.ratio;
    return { entry, dash, offset };
  });
  const breakdownMap = useMemo(() => {
    const map = new Map<string, CompactClassificationBreakdownRow[]>();
    for (const entry of entries) {
      map.set(entry.productivity, buildCompactClassificationBreakdown(flowBlocks, (block) => block.productivity === entry.productivity));
    }
    return map;
  }, [entries, flowBlocks]);

  function showSegmentHover(entry: ProductivityDuration, x: number, y: number) {
    setHoveredSegment({
      label: productivityLabel(entry.productivity),
      durationLabel: formatCompactDurationFromSeconds(entry.totalSeconds),
      shareLabel: `${Math.round(entry.ratio * 100)}%`,
      dotClassName: productivityDotClassName(entry.productivity),
      color: productivityToneColor[entry.productivity],
      appBreakdown: breakdownMap.get(entry.productivity) ?? [],
      x,
      y
    });
  }

  return (
    <div className="flow-compact-split-chart__panel flow-compact-split-chart__panel--circle" role="group" aria-label="Productivity compact classification">
      <div className="flow-compact-split-chart__head">
        <span className="label-mono">Productivity</span>
        <strong>{formatCompactDurationFromSeconds(totalSeconds)}</strong>
      </div>
      <div className="flow-compact-productivity-circle">
        <div className="flow-compact-productivity-circle__dial-shell">
          <svg className="flow-compact-productivity-circle__dial" role="group" aria-label={circleLabel} viewBox="0 0 100 100">
            <circle className="flow-compact-productivity-circle__track" cx="50" cy="50" r="40" />
            {circleSegments.map(({ entry, dash, offset }) => (
              <circle
                className="flow-compact-productivity-circle__segment"
                cx={50}
                cy={50}
                key={entry.productivity}
                r={40}
                stroke={productivityToneColor[entry.productivity]}
                strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE}`}
                strokeDashoffset={offset}
                tabIndex={0}
                aria-label={`${productivityLabel(entry.productivity)} · ${formatCompactDurationFromSeconds(entry.totalSeconds)} · ${Math.round(entry.ratio * 100)}%`}
                onMouseEnter={(event: MouseEvent<SVGCircleElement>) => showSegmentHover(entry, event.clientX, event.clientY)}
                onMouseLeave={() => setHoveredSegment(null)}
                onFocus={(event: React.FocusEvent<SVGCircleElement>) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setHoveredSegment({
                    label: productivityLabel(entry.productivity),
                    shareLabel: `${Math.round(entry.ratio * 100)}%`,
                    durationLabel: formatCompactDurationFromSeconds(entry.totalSeconds),
                    dotClassName: productivityDotClassName(entry.productivity),
                    color: productivityToneColor[entry.productivity],
                    appBreakdown: breakdownMap.get(entry.productivity) ?? [],
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                  });
                }}
                onBlur={() => setHoveredSegment(null)}
              />
            ))}
          </svg>
          <div className="flow-compact-productivity-circle__center" aria-hidden="true">
            <strong>{focusPercent}%</strong>
          </div>
        </div>
        <div className="flow-compact-split-chart__legend" aria-hidden="true">
          {summaryEntries.map((entry) => (
            <span className="flow-compact-split-chart__legend-item" key={entry.productivity}>
              <span className="flow-compact-split-chart__swatch" style={{ background: productivityToneColor[entry.productivity] }} />
              <span className="flow-compact-split-chart__legend-label">{productivityLabel(entry.productivity)}</span>
              <span className="flow-compact-split-chart__legend-value">{formatCompactDurationFromSeconds(entry.totalSeconds)}</span>
            </span>
          ))}
        </div>
      </div>
      {hoveredSegment ? <CompactClassificationHoverCard hover={hoveredSegment} appIcons={appIcons} /> : null}
    </div>
  );
}

function CompactClassificationBar<TEntry extends { totalSeconds: number; ratio: number }>({
  title,
  ariaLabel,
  entries,
  totalSeconds,
  getKey,
  getLabel,
  getColor,
  getDotClassName,
  getAppBreakdown,
  appIcons,
  visibleLimit = 3
}: {
  title: string;
  ariaLabel: string;
  entries: TEntry[];
  totalSeconds: number;
  getKey: (entry: TEntry) => string;
  getLabel: (entry: TEntry) => string;
  getColor: (entry: TEntry) => string;
  getDotClassName: (entry: TEntry) => string;
  getAppBreakdown: (entry: TEntry) => CompactClassificationBreakdownRow[];
  appIcons: Record<string, string | null>;
  visibleLimit?: number;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<CompactClassificationHoverState | null>(null);
  const activeEntries = entries.filter((entry) => entry.totalSeconds > 0);
  const summaryEntries = activeEntries.length > 0 ? activeEntries : entries;
  const barLabel = formatCompactBarLabel(title, entries, getLabel);
  const breakdownMap = useMemo(() => {
    const map = new Map<string, CompactClassificationBreakdownRow[]>();
    for (const entry of entries) {
      map.set(getKey(entry), getAppBreakdown(entry));
    }
    return map;
  }, [entries, getAppBreakdown, getKey]);

  function showSegmentHover(entry: TEntry, x: number, y: number) {
    setHoveredSegment({
      label: getLabel(entry),
      durationLabel: formatCompactDurationFromSeconds(entry.totalSeconds),
      shareLabel: `${Math.round(entry.ratio * 100)}%`,
      dotClassName: getDotClassName(entry),
      color: getColor(entry),
      appBreakdown: breakdownMap.get(getKey(entry)) ?? [],
      x,
      y
    });
  }

  return (
    <div className="flow-compact-split-chart__panel" role="group" aria-label={ariaLabel}>
      <div className="flow-compact-split-chart__head">
        <span className="label-mono">{title}</span>
        <strong>{formatCompactDurationFromSeconds(totalSeconds)}</strong>
      </div>
      <div className="flow-compact-split-chart__bar" role="group" aria-label={barLabel}>
        {activeEntries.map((entry) => (
          <button
            type="button"
            key={getKey(entry)}
            className="flow-compact-split-chart__segment"
            style={{ width: `${entry.ratio * 100}%`, background: getColor(entry) }}
            title={`${getLabel(entry)} · ${formatCompactDurationFromSeconds(entry.totalSeconds)} · ${Math.round(entry.ratio * 100)}%`}
            aria-label={`${getLabel(entry)} · ${formatCompactDurationFromSeconds(entry.totalSeconds)} · ${Math.round(entry.ratio * 100)}%`}
            onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => showSegmentHover(entry, event.clientX, event.clientY)}
            onMouseLeave={() => setHoveredSegment(null)}
            onFocus={(event: React.FocusEvent<HTMLButtonElement>) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setHoveredSegment({
                label: getLabel(entry),
                shareLabel: `${Math.round(entry.ratio * 100)}%`,
                durationLabel: formatCompactDurationFromSeconds(entry.totalSeconds),
                dotClassName: getDotClassName(entry),
                color: getColor(entry),
                appBreakdown: breakdownMap.get(getKey(entry)) ?? [],
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
              });
            }}
            onBlur={() => setHoveredSegment(null)}
          />
        ))}
      </div>
      <div className="flow-compact-split-chart__legend" aria-hidden="true">
        {summaryEntries.slice(0, visibleLimit).map((entry) => (
          <span className="flow-compact-split-chart__legend-item" key={getKey(entry)}>
            <span className="flow-compact-split-chart__swatch" style={{ background: getColor(entry) }} />
            <span className="flow-compact-split-chart__legend-label">{getLabel(entry)}</span>
            <span className="flow-compact-split-chart__legend-value">{formatCompactDurationFromSeconds(entry.totalSeconds)}</span>
          </span>
        ))}
      </div>
      {hoveredSegment ? <CompactClassificationHoverCard hover={hoveredSegment} appIcons={appIcons} /> : null}
    </div>
  );
}

function CompactClassificationHoverCard({ hover, appIcons }: { hover: CompactClassificationHoverState; appIcons: Record<string, string | null> }) {
  const [position, cardRef] = useViewportSafeHoverPosition(hover, [hover.appBreakdown, hover.durationLabel, hover.label, hover.shareLabel]);

  return (
    <div ref={cardRef} className="flow-hover-card category-hover-card compact-classification-hover-card" style={position}>
      <div className="category-hover-card__head">
        <span className={`category-dot ${hover.dotClassName}`} style={{ background: hover.color }} aria-hidden="true" />
        <strong>{hover.label}</strong>
      </div>
      <div className="category-treemap-hover-card__metric">
        <strong>{hover.durationLabel}</strong>
        <span>{hover.shareLabel} of tracked time</span>
      </div>
      <div className="category-treemap-hover-card__accent" aria-hidden="true">
        <span style={{ width: hover.shareLabel, background: hover.color }} />
      </div>
      <div className="category-hover-card__apps">
        {hover.appBreakdown.length > 0 ? hover.appBreakdown.map((item) => {
          const label = item.siteDomain ?? item.siteTitle ?? item.appName;
          const iconSrc = appIcons[item.bundleId ?? item.appName] ?? null;
          return (
            <div className="category-hover-card__app" key={`${item.siteDomain ?? item.siteTitle ?? item.bundleId ?? item.appName}`}>
              <span className="usage-identity-icon usage-identity-icon--sm">
                {item.siteDomain ? <SiteFavicon domain={item.siteDomain} size={20} fallbackIconSrc={iconSrc} /> : <AppGlyph appName={label} size="sm" iconSrc={item.siteTitle ? null : iconSrc} />}
              </span>
              <span>{label}</span>
              <strong>{secondsToLabel(item.totalSeconds)}</strong>
            </div>
          );
        }) : <span className="category-hover-card__empty">No app breakdown yet.</span>}
      </div>
    </div>
  );
}

function DayView({ data }: { data: DashboardData }) {
  const topFocus = data.today.productivityDurations.find((item) => item.productivity === 'focus')?.totalSeconds ?? 0;
  const topDrift = data.today.productivityDurations.find((item) => item.productivity === 'drift')?.totalSeconds ?? 0;
  const [flowIntervalMinutes, setFlowIntervalMinutes] = useState<FlowIntervalMinutes>(3);
  const day = dashboardDayIsoDate(data.today);
  const startOfDayMinutes = dashboardStartOfDayMinutes();
  const isSelectedDayToday = day === logicalDayIsoDateForDate(new Date(), startOfDayMinutes);
  const flowBlocks = useMemo(
    () => buildFlowBlocks(data.today.segments, day, flowIntervalMinutes, undefined, startOfDayMinutes),
    [data.today.segments, day, flowIntervalMinutes, startOfDayMinutes]
  );
  const appIcons = useMemo<AppIconMap>(() => buildAppIconMap(data.today.segments), [data.today.segments]);
  const hasTimelineData = flowBlocks.length > 0;

  return (
    <div className="stack">
      {hasTimelineData ? (
        <div className="flow-breakdown-layout">
          <div className="flow-breakdown-layout__chart">
	            <FlowChartView
	              blocks={flowBlocks}
	              currentMinuteOfDay={isSelectedDayToday ? currentMinuteOfDay() : null}
              intervalMinutes={flowIntervalMinutes}
              startOfDayMinutes={startOfDayMinutes}
              onIntervalChange={setFlowIntervalMinutes}
              appIcons={appIcons}
            />
          </div>
          <FlowCompactSplitChart
            categoryEntries={data.today.categoryDurations}
            productivityEntries={data.today.productivityDurations}
            totalSeconds={data.today.totalSeconds}
            flowBlocks={flowBlocks}
            appIcons={appIcons}
          />
        </div>
      ) : (
        <EmptyState title="No timeline yet" detail={data.currentSession ? `Tracker is live for ${formatDateLabel(day)}.` : 'Tracking is paused. Use the sidebar control or move to a day with recorded activity.'} />
      )}

      <div className="grid grid--dashboard">
        <div className="stack">
          <Panel title="Today so far" eyebrow="Your Day">
            <div className="grid grid--two">
              <Metric label="Local time" value={formatDuration(data.today.totalSeconds)} detail={pluralize(data.today.segments.length, 'segment')} />
              <Metric label="Current" value={data.currentSession ? formatDuration(data.currentSession.durationSeconds) : 'Idle'} detail={data.currentSession?.siteDomain ?? data.currentSession?.siteTitle ?? 'No active browser session'} />
              <Metric label="Focus" value={formatDuration(topFocus)} detail="Classified locally from browser sessions" />
              <Metric label="Drift" value={formatDuration(topDrift)} detail="Shown only on this device" />
            </div>
          </Panel>

          <Panel title="Productivity mix">
            <ToneBars items={productivityItems(data.today)} emptyTitle="Usage is still quiet" emptyDetail="Leave Drifty running while you browse and today's mix will fill in here." />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Browser usage panel" eyebrow="Local summary">
            {data.today.topActivities.length > 0 ? (
              <div className="list">
                {data.today.topActivities.map((activity) => (
                  <div className="list-row" key={`${activity.usageKind}-${activity.appName}`}>
                    <div className="list-title">
                      <strong className="truncate">{activity.siteDomain ?? activity.appName}</strong>
                      <span className="muted truncate">{topActivityDetailLabel(activity, data.today.segments)} · {pluralize(activity.sessionCount, 'session')} · average {formatDuration(activity.averageSessionSeconds)}</span>
                    </div>
                    <span className="measure">{formatDuration(activity.totalSeconds)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No activity yet" detail="Local site summaries appear after the extension records browser sessions." />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function WeekView({ data }: { data: DashboardData }) {
  return <WeekCalendarView data={data} startOfDayMinutes={dashboardStartOfDayMinutes()} />;
}

function SettingsView({ data }: { data: DashboardData }) {
  const sync = data.settings.sync;
  const privacy = data.settings.privacy;

  return (
    <div className="settings-tab-surface stack">
      <div className="grid grid--dashboard">
        <div className="stack">
          <Panel title="General" eyebrow="Settings">
            <SettingsFlag label="Cloud sync" detail="Off by default. This dashboard reads local extension summaries only." enabled={sync.cloudSyncEnabled} />
            <SettingsFlag label="Remote category sync" detail="Remote category updates remain a local setting and are not changed here." enabled={sync.remoteCategorySyncEnabled} />
          </Panel>

          <Panel title="Classification rules">
            <div className="list">
              {data.categories.map((category) => (
                <div className="list-row" key={`settings-${category.id}`}>
                  <div className="list-title">
                    <strong>{category.label}</strong>
                    <span className="muted truncate">{category.legacyKeys.length > 0 ? pluralize(category.legacyKeys.length, 'legacy key') : 'No legacy keys reported'}</span>
                  </div>
                  <span className="pill"><span className="dot" style={{ background: categoryToneColor[category.id] }} />Local</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Data & export">
            <div className="notice">
              <strong>Raw tracking history is not published</strong>
              <p className="muted">This tab shows settings from the installed extension and does not start uploads, downloads, or sync jobs.</p>
            </div>
            <SettingsFlag label="Raw history sync" detail="Raw sites, titles, and browsing history stay local unless a future explicit opt-in exists." enabled={sync.rawHistorySyncEnabled} />
            <SettingsFlag label="Raw session sync" detail="Raw session details are not mirrored to shared services." enabled={sync.rawSessionSyncEnabled} />
          </Panel>

          <Panel title="Privacy posture">
            <SettingsFlag label="Keep raw browsing local" detail="Raw site context is preserved only in local browser storage." enabled={privacy.preserveRawBrowsingLocalOnly} />
            <SettingsFlag label="Keep raw sessions local" detail="Session details are not mirrored to shared services." enabled={privacy.preserveRawSessionsLocalOnly} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DashboardApp() {
  const [activeTab, setActiveTab] = useState<TabKey>('day');
  const [selectedDay, setSelectedDay] = useState(() => logicalDayIsoDateForDate(new Date(), dashboardStartOfDayMinutes()));
  const [state, setState] = useState<LoadState>({ status: 'loading', data: null, error: null });
  const logicalToday = logicalDayIsoDateForDate(new Date(), dashboardStartOfDayMinutes());

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', data: null, error: null });

    loadDashboardData(selectedDay)
      .then((data) => {
        if (active) setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', data: null, error: error instanceof Error ? error.message : 'Unable to load local summaries.' });
      });

    return () => {
      active = false;
    };
  }, [selectedDay]);

  const content = useMemo(() => {
    if (!state.data) return null;
    if (activeTab === 'day') return <DayView data={state.data} />;
    if (activeTab === 'week') return <WeekView data={state.data} />;
    if (activeTab === 'classification') return <ClassificationView data={state.data} />;
    if (activeTab === 'history') return <HistoryView />;
    return <SettingsView data={state.data} />;
  }, [activeTab, state.data]);

  return (
    <main className="surface surface--dashboard">
      <div className="dashboard-layout">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabKey)}
          navItems={navSections}
          logoSrc={typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/drifty-icon.png') : undefined}
        />
        <div className="shell shell--dashboard">
          <nav className="mobile-tabs" aria-label="Dashboard sections">
            {navSections.flatMap((s) => s.items).map((item) => (
              <button
                key={item.id}
                className={activeTab === item.id ? 'mobile-tab mobile-tab--active' : 'mobile-tab'}
                type="button"
                onClick={() => setActiveTab(item.id as TabKey)}
                aria-current={activeTab === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <header className="page-header page-header--dashboard">
            <div className="brand-lockup">
              <span className="eyebrow">Drifty dashboard</span>
              <h1>Your browser time, kept local.</h1>
              <p className="muted">Your Day, Week, Classification, History, and Settings for this extension install.</p>
            </div>
            <div className="dashboard-header-actions">
              <PrivacyPills runtimeReady={state.status === 'ready'} />
              <DateNavigator selectedDay={selectedDay} today={logicalToday} onDayChange={setSelectedDay} />
            </div>
          </header>

          {state.status === 'loading' ? <StatusBox title="Loading local summaries" detail="Drifty is reading browser activity from the extension runtime." /> : null}
          {state.status === 'error' ? <StatusBox title="Extension reader paused" detail={state.error ?? 'Open the dashboard from the installed extension to view local summaries.'} kind="error" /> : null}
          {content}
        </div>
      </div>
    </main>
  );
}

mountSurface(<DashboardApp />);
