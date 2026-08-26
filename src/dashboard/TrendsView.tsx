import { useEffect, useMemo, useState } from 'react';
import {
  classifyActivityDetailed,
  logicalDayIsoDateForDate,
  shiftIsoDate,
  type ActivityCategory,
  type ActivitySegment,
  type ProductivityLabel
} from '../lib/domain';
import { browserTrackerClient, DRIFTY_CATEGORY_METADATA, type DriftyStatsSummary } from '../lib/drifty';
import { formatDuration } from '../shared/format';
import { EmptyState, Panel, StatusBox } from '../shared/SurfacePrimitives';
import { AppGlyph, SiteFavicon } from './IdentityIcon';

const RHYTHM_WINDOW_DAYS = 28;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const categoryToneColor: Record<ActivityCategory, string> = {
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

type RhythmCell = { weekdayIndex: number; hour: number; state: ProductivityLabel; intensity: number; focusSeconds: number; driftSeconds: number };
type SourceItem = { id: string; label: string; siteDomain: string | null; appName: string; seconds: number };
type DayPoint = { date: string; totalSeconds: number; focusSeconds: number };

function focusSecondsOf(summary: DriftyStatsSummary): number {
  return summary.productivityDurations.find((entry) => entry.productivity === 'focus')?.totalSeconds ?? 0;
}

function weekdayIndexMonFirst(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function buildAttentionRhythm(segments: ActivitySegment[]): { cells: RhythmCell[]; hasData: boolean } {
  const focus = new Array(7 * 24).fill(0);
  const drift = new Array(7 * 24).fill(0);
  for (const segment of segments) {
    const productivity = classifyActivityDetailed(segment).productivity;
    if (productivity !== 'focus' && productivity !== 'drift') continue;
    const started = new Date(segment.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const index = weekdayIndexMonFirst(started) * 24 + started.getHours();
    if (productivity === 'focus') focus[index] += segment.durationSeconds;
    else drift[index] += segment.durationSeconds;
  }
  let max = 0;
  for (let i = 0; i < focus.length; i += 1) max = Math.max(max, focus[i] + drift[i]);
  const cells: RhythmCell[] = [];
  for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const index = weekdayIndex * 24 + hour;
      const focusSeconds = focus[index];
      const driftSeconds = drift[index];
      const total = focusSeconds + driftSeconds;
      const state: ProductivityLabel = total === 0 ? 'neutral' : focusSeconds >= driftSeconds ? 'focus' : 'drift';
      const intensity = total === 0 || max === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((total / max) * 4)));
      cells.push({ weekdayIndex, hour, state, intensity, focusSeconds, driftSeconds });
    }
  }
  return { cells, hasData: max > 0 };
}

function buildSourceList(segments: ActivitySegment[], productivity: ProductivityLabel): SourceItem[] {
  const totals = new Map<string, SourceItem>();
  for (const segment of segments) {
    if (classifyActivityDetailed(segment).productivity !== productivity) continue;
    const siteDomain = segment.siteDomain ?? null;
    const label = siteDomain ?? segment.siteTitle ?? segment.appName;
    const id = siteDomain ? `site:${siteDomain}` : `app:${segment.bundleId ?? segment.appName}`;
    const existing = totals.get(id) ?? { id, label, siteDomain, appName: segment.appName, seconds: 0 };
    existing.seconds += segment.durationSeconds;
    totals.set(id, existing);
  }
  return Array.from(totals.values()).sort((a, b) => b.seconds - a.seconds).slice(0, 5);
}

function rhythmHourLabel(hour: number): string {
  if (hour % 6 !== 0) return '';
  const period = hour < 12 ? 'a' : 'p';
  const display = hour % 12 || 12;
  return `${display}${period}`;
}

export function TrendsView({ startOfDayMinutes }: { startOfDayMinutes: number }) {
  const [segments, setSegments] = useState<ActivitySegment[] | null>(null);
  const [days, setDays] = useState<DayPoint[] | null>(null);
  const [recentSegments, setRecentSegments] = useState<ActivitySegment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const today = logicalDayIsoDateForDate(new Date(), startOfDayMinutes);
      const dates = Array.from({ length: RHYTHM_WINDOW_DAYS }, (_, index) => shiftIsoDate(today, -(RHYTHM_WINDOW_DAYS - 1 - index)));
      const summaries = await Promise.all(dates.map((date) => browserTrackerClient.getDateStats(date).catch(() => null)));
      if (!active) return;
      const allSegments: ActivitySegment[] = [];
      const dayPoints: DayPoint[] = [];
      const recent: ActivitySegment[] = [];
      dates.forEach((date, index) => {
        const summary = summaries[index];
        const segs = summary?.segments ?? [];
        allSegments.push(...segs);
        if (index >= RHYTHM_WINDOW_DAYS - 7) recent.push(...segs);
        dayPoints.push({ date, totalSeconds: summary?.totalSeconds ?? 0, focusSeconds: summary ? focusSecondsOf(summary) : 0 });
      });
      setSegments(allSegments);
      setDays(dayPoints);
      setRecentSegments(recent);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [startOfDayMinutes]);

  const rhythm = useMemo(() => (segments ? buildAttentionRhythm(segments) : null), [segments]);
  const focusSources = useMemo(() => buildSourceList(recentSegments, 'focus'), [recentSegments]);
  const driftSources = useMemo(() => buildSourceList(recentSegments, 'drift'), [recentSegments]);

  const kpi = useMemo(() => {
    if (!days) return null;
    const last7 = days.slice(-7);
    const prev7 = days.slice(-14, -7);
    const sum = (points: DayPoint[], key: 'totalSeconds' | 'focusSeconds') => points.reduce((t, p) => t + p[key], 0);
    const thisTotal = sum(last7, 'totalSeconds');
    const lastTotal = sum(prev7, 'totalSeconds');
    const thisFocusPct = thisTotal > 0 ? Math.round((sum(last7, 'focusSeconds') / thisTotal) * 100) : 0;
    const lastFocusPct = lastTotal > 0 ? Math.round((sum(prev7, 'focusSeconds') / lastTotal) * 100) : 0;
    return { thisTotal, lastTotal, thisFocusPct, lastFocusPct, dailyPeak: Math.max(...days.slice(-14).map((p) => p.totalSeconds), 1), last14: days.slice(-14) };
  }, [days]);

  if (loading) return <StatusBox title="Building trends" detail="Reading recent local activity to build your patterns." />;
  if (!kpi || !rhythm || (kpi.thisTotal === 0 && kpi.lastTotal === 0 && !rhythm.hasData)) {
    return <EmptyState title="No trends yet" detail="Patterns appear once the extension has recorded activity across several days." />;
  }

  const totalDeltaMinutes = Math.round((kpi.thisTotal - kpi.lastTotal) / 60);
  const focusDelta = kpi.thisFocusPct - kpi.lastFocusPct;

  return (
    <div className="trends-tab-surface stack">
      <div className="grid grid--two">
        <Panel title="Time this week" eyebrow="Trends">
          <div className="trends-kpi">
            <strong>{formatDuration(kpi.thisTotal)}</strong>
            <DeltaPill delta={totalDeltaMinutes} unit="m vs last week" />
          </div>
          <p className="muted">Last week: {formatDuration(kpi.lastTotal)}</p>
        </Panel>
        <Panel title="Focus share this week">
          <div className="trends-kpi">
            <strong>{kpi.thisFocusPct}%</strong>
            <DeltaPill delta={focusDelta} unit="pts vs last week" />
          </div>
          <p className="muted">Last week: {kpi.lastFocusPct}%</p>
        </Panel>
      </div>

      <Panel title="Weekly attention rhythm" eyebrow="When you focus & drift">
        {rhythm.hasData ? (
          <AttentionRhythmGrid cells={rhythm.cells} />
        ) : (
          <EmptyState title="No rhythm yet" detail="The weekly attention rhythm appears after activity is recorded across the window." />
        )}
      </Panel>

      <div className="grid grid--two">
        <SourceGroup variant="focus" items={focusSources} />
        <SourceGroup variant="drift" items={driftSources} />
      </div>

      <Panel title="Daily activity (14 days)" eyebrow="Trend">
        <div className="trends-bars" role="img" aria-label="Daily tracked time over the last 14 days">
          {kpi.last14.map((point) => {
            const heightPercent = Math.max((point.totalSeconds / kpi.dailyPeak) * 100, point.totalSeconds > 0 ? 6 : 0);
            const focusHeightPercent = point.totalSeconds > 0 ? (point.focusSeconds / kpi.dailyPeak) * 100 : 0;
            return (
              <div className="trends-bar" key={point.date} title={`${point.date.slice(5)}: ${formatDuration(point.totalSeconds)}`}>
                <div className="trends-bar__track">
                  <span className="trends-bar__total" style={{ height: `${heightPercent}%` }} />
                  <span className="trends-bar__focus" style={{ height: `${focusHeightPercent}%` }} />
                </div>
                <small>{Number(point.date.slice(8))}</small>
              </div>
            );
          })}
        </div>
        <div className="trends-legend">
          <span><span className="trends-legend__swatch trends-legend__swatch--total" />Total</span>
          <span><span className="trends-legend__swatch trends-legend__swatch--focus" />Focus</span>
        </div>
      </Panel>

      <TrendsCategoryDelta startOfDayMinutes={startOfDayMinutes} categoryColors={categoryToneColor} />
    </div>
  );
}

function AttentionRhythmGrid({ cells }: { cells: RhythmCell[] }) {
  const [hover, setHover] = useState<{ cell: RhythmCell; x: number; y: number } | null>(null);
  return (
    <div className="rhythm">
      <div className="rhythm__hours" aria-hidden="true">
        <span />
        {Array.from({ length: 24 }, (_, hour) => <span key={hour}>{rhythmHourLabel(hour)}</span>)}
      </div>
      {WEEKDAY_LABELS.map((weekday, weekdayIndex) => (
        <div className="rhythm__row" key={weekday}>
          <span className="rhythm__weekday">{weekday}</span>
          {Array.from({ length: 24 }, (_, hour) => {
            const cell = cells[weekdayIndex * 24 + hour];
            const variant = cell.state === 'neutral' || cell.intensity === 0 ? 'empty' : `${cell.state}-${cell.intensity}`;
            return (
              <span
                key={hour}
                className={`rhythm__cell rhythm__cell--${variant}`}
                onMouseEnter={(event) => cell.intensity > 0 && setHover({ cell, x: event.clientX, y: event.clientY })}
                onMouseMove={(event) => setHover((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current))}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </div>
      ))}
      <div className="rhythm__legend" aria-hidden="true">
        <span><span className="rhythm__legend-dot rhythm__legend-dot--focus" />Focus</span>
        <span><span className="rhythm__legend-dot rhythm__legend-dot--drift" />Drift</span>
      </div>
      {hover ? (
        <div className="rhythm__hover" style={{ position: 'fixed', left: Math.min(hover.x + 14, window.innerWidth - 180), top: hover.y + 14 }}>
          <strong>{WEEKDAY_LABELS[hover.cell.weekdayIndex]} {hover.cell.hour}:00</strong>
          <span className="rhythm__hover-focus">Focus {formatDuration(hover.cell.focusSeconds)}</span>
          <span className="rhythm__hover-drift">Drift {formatDuration(hover.cell.driftSeconds)}</span>
        </div>
      ) : null}
    </div>
  );
}

function SourceGroup({ variant, items }: { variant: ProductivityLabel; items: SourceItem[] }) {
  const label = variant === 'drift' ? 'Drift patterns' : 'Focus patterns';
  const maxValue = Math.max(1, ...items.map((item) => item.seconds));
  return (
    <Panel title={label} eyebrow={variant === 'drift' ? 'Where time slips' : 'Where you focus'}>
      {items.length > 0 ? (
        <div className={`source-list source-list--${variant}`}>
          {items.map((item, index) => (
            <div className="source-list__item" key={item.id}>
              <span className="source-list__rank">{index + 1}</span>
              <span className="source-list__icon">
                {item.siteDomain ? <SiteFavicon domain={item.siteDomain} size={16} /> : <AppGlyph appName={item.appName} size="sm" />}
              </span>
              <span className="source-list__name truncate">{item.label}</span>
              <strong className="source-list__value">{formatDuration(item.seconds)}</strong>
              <div className="source-list__bar"><div style={{ width: `${Math.max((item.seconds / maxValue) * 100, 3)}%` }} /></div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No {variant} sources recorded yet this week.</p>
      )}
    </Panel>
  );
}

function DeltaPill({ delta, unit }: { delta: number; unit: string }) {
  if (delta === 0) return <span className="trends-delta trends-delta--flat">±0{unit}</span>;
  const up = delta > 0;
  return <span className={`trends-delta ${up ? 'trends-delta--up' : 'trends-delta--down'}`}>{up ? '▲' : '▼'} {Math.abs(delta)}{unit}</span>;
}

function sumCategory(summaries: DriftyStatsSummary[]): Map<ActivityCategory, number> {
  const totals = new Map<ActivityCategory, number>();
  for (const summary of summaries) {
    for (const entry of summary.categoryDurations) {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.totalSeconds);
    }
  }
  return totals;
}

function TrendsCategoryDelta({ startOfDayMinutes, categoryColors }: { startOfDayMinutes: number; categoryColors: Record<ActivityCategory, string> }) {
  const [rows, setRows] = useState<Array<{ category: ActivityCategory; thisSeconds: number; lastSeconds: number }> | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const today = logicalDayIsoDateForDate(new Date(), startOfDayMinutes);
      const thisDates = Array.from({ length: 7 }, (_, index) => shiftIsoDate(today, -(6 - index)));
      const lastDates = thisDates.map((date) => shiftIsoDate(date, -7));
      const [thisSummaries, lastSummaries] = await Promise.all([
        Promise.all(thisDates.map((date) => browserTrackerClient.getDateStats(date).catch(() => null))),
        Promise.all(lastDates.map((date) => browserTrackerClient.getDateStats(date).catch(() => null)))
      ]);
      if (!active) return;
      const thisTotals = sumCategory(thisSummaries.filter((s): s is DriftyStatsSummary => Boolean(s)));
      const lastTotals = sumCategory(lastSummaries.filter((s): s is DriftyStatsSummary => Boolean(s)));
      const categories = new Set<ActivityCategory>([...thisTotals.keys(), ...lastTotals.keys()]);
      const next = Array.from(categories)
        .map((category) => ({ category, thisSeconds: thisTotals.get(category) ?? 0, lastSeconds: lastTotals.get(category) ?? 0 }))
        .filter((row) => row.thisSeconds > 0 || row.lastSeconds > 0)
        .sort((a, b) => b.thisSeconds - a.thisSeconds)
        .slice(0, 6);
      setRows(next);
    }
    void load();
    return () => { active = false; };
  }, [startOfDayMinutes]);

  if (!rows || rows.length === 0) return null;

  return (
    <Panel title="Category shift" eyebrow="This week vs last">
      <div className="list">
        {rows.map((row) => {
          const deltaMinutes = Math.round((row.thisSeconds - row.lastSeconds) / 60);
          return (
            <div className="list-row" key={row.category}>
              <div className="list-title">
                <strong><span className="category-dot" style={{ background: categoryColors[row.category], display: 'inline-block', width: '0.55rem', height: '0.55rem', borderRadius: '999px', marginRight: '0.4rem' }} />{DRIFTY_CATEGORY_METADATA[row.category].label}</strong>
                <span className="muted">Last week {formatDuration(row.lastSeconds)}</span>
              </div>
              <div className="trends-category-measure">
                <span className="measure">{formatDuration(row.thisSeconds)}</span>
                <DeltaPill delta={deltaMinutes} unit="m" />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
