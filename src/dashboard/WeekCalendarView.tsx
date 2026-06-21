import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { logicalDayIsoDateForDate, logicalMinuteOfDay, secondsToLabel, shiftIsoDate, type ActivityCategory } from '../lib/domain';
import { DRIFTY_CATEGORY_METADATA, type DriftyStatsSummary, type DriftyWeeklyStatsSummary } from '../lib/drifty';
import { formatDuration, pluralize } from '../shared/format';
import { Panel } from '../shared/SurfacePrimitives';
import { SiteFavicon } from './IdentityIcon';
import { buildWeekCalendarEvents, buildWeekDayRows, type WeekCalendarEvent } from './weekCalendarModel';
import './week-calendar.css';

const CALENDAR_HOUR_HEIGHT = 56;
const CALENDAR_START_HOUR = 0;
const CALENDAR_END_HOUR = 24;
const CALENDAR_HOURS = Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR }, (_, index) => CALENDAR_START_HOUR + index);

type WeekViewData = {
  readonly week: DriftyWeeklyStatsSummary;
};

type WeekCalendarEventStyle = CSSProperties & {
  readonly '--event-tone'?: string;
};

type WeekCalendarNowMarkerStyle = CSSProperties & {
  readonly '--week-calendar-now-offset': string;
  readonly '--week-calendar-now-line-end': string;
};

export function WeekCalendarView({ data, startOfDayMinutes }: { data: WeekViewData; startOfDayMinutes: number }) {
  const { startDay, endDay } = weekRange(data.week, startOfDayMinutes);
  const rows = useMemo(
    () => buildWeekDayRows(data.week.segments, startDay, endDay, startOfDayMinutes),
    [data.week.segments, endDay, startDay, startOfDayMinutes]
  );
  const events = useMemo(
    () => buildWeekCalendarEvents(data.week.segments, startDay, endDay, startOfDayMinutes),
    [data.week.segments, endDay, startDay, startOfDayMinutes]
  );
  const focusSeconds = productivityTotal(data.week, 'focus');
  const driftSeconds = productivityTotal(data.week, 'drift');
  const focusShare = data.week.totalSeconds > 0 ? Math.round((focusSeconds / data.week.totalSeconds) * 100) : 0;
  const peakFocus = Math.max(...rows.map((row) => row.focusSeconds), 1);
  const rankedRows = rows.slice().sort((left, right) => right.totalSeconds - left.totalSeconds || left.day.localeCompare(right.day));
  const bestDay = rankedRows.find((row) => row.totalSeconds > 0) ?? null;
  const categories = data.week.categoryDurations.filter((entry) => entry.totalSeconds > 0).slice(0, 5);
  const todayDay = logicalDayIsoDateForDate(new Date(), startOfDayMinutes);
  const currentMinute = startDay <= todayDay && todayDay <= endDay
    ? logicalMinuteOfDay(new Date().getHours() * 60 + new Date().getMinutes(), startOfDayMinutes)
    : null;
  const currentMarkerStyle = currentMinute === null ? null : nowMarkerStyle(currentMinute, rows.findIndex((row) => row.day === todayDay));

  return (
    <div className="week-tab-surface week-v2" aria-label="Your week overview">
      <div className="week-v2-grid week-v2-grid--calendar">
        <section className="week-v2-calendar editorial-panel editorial-panel--soft" aria-label="Week calendar schedule">
          <div className="week-v2-summary week-v2-summary--compact week-v2-summary--integrated" aria-label="Week summary">
            <div className="week-v2-summary__main">
              <span className="label-mono">Week focus</span>
              <strong>{secondsToLabel(focusSeconds)}</strong>
            </div>
            <div className="week-v2-summary__bars" aria-hidden="true">
              {rows.map((row) => {
                const barHeight = row.focusSeconds > 0 ? Math.max(4, Math.round((row.focusSeconds / peakFocus) * 30)) : 2;
                return (
                  <span className={`week-v2-summary__bar${bestDay?.day === row.day ? ' is-peak' : ''}${todayDay === row.day ? ' is-today' : ''}${row.focusSeconds === 0 ? ' is-empty' : ''}`} key={row.day}>
                    <span className="week-v2-summary__bar-fill" style={{ height: `${barHeight}px` }} />
                    <small>{row.dayName.charAt(0)}</small>
                  </span>
                );
              })}
            </div>
            <div className="week-v2-summary__meta">
              <span>No prior week</span>
              <span>Best {bestDay ? `${bestDay.dayName} ${bestDay.dayNumber}` : '-'}</span>
              <span>Focus share {focusShare}%</span>
              <span>Drift {secondsToLabel(driftSeconds)}</span>
            </div>
          </div>

          <WeekCategoryLegend categories={categories.map((entry) => entry.category)} />
          <WeekCalendarGrid rows={rows} events={events} currentMarkerStyle={currentMarkerStyle} startOfDayMinutes={startOfDayMinutes} todayDay={todayDay} />
        </section>

        <aside className="week-v2-side" aria-label="Week time breakdown">
          <WeekCategoryMix categories={categories} />
          <WeekRankedDays rows={rankedRows} />
          <Panel title="Top sources this week">
            {data.week.topActivities.length > 0 ? (
              <div className="list">
                {data.week.topActivities.map((activity) => (
                  <div className="list-row" key={`week-${activity.usageKind}-${activity.siteDomain ?? activity.appName}`}>
                    <div className="list-title">
                      <strong className="truncate">{activity.siteDomain ?? activity.appName}</strong>
                      <span className="muted truncate">{pluralize(activity.sessionCount, 'session')} · {pluralize(activity.activeDays, 'active day')}</span>
                    </div>
                    <span className="measure">{formatDuration(activity.totalSeconds)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="week-v2-empty">No weekly sources yet.</p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function WeekCalendarGrid({ rows, events, currentMarkerStyle, startOfDayMinutes, todayDay }: { rows: ReturnType<typeof buildWeekDayRows>; events: Map<string, WeekCalendarEvent[]>; currentMarkerStyle: WeekCalendarNowMarkerStyle | null; startOfDayMinutes: number; todayDay: string }) {
  return (
    <div className="week-v2-calendar__scroller">
      <div className="week-v2-calendar__day-head" aria-hidden="true">
        <span />
        {rows.map((row) => (
          <span className={`${isWeekend(row.day) ? 'is-weekend' : ''}${row.day === todayDay ? ' is-today' : ''}`.trim()} key={row.day}>
            <strong>{row.dayName}</strong>
            <small>{row.dayNumber}</small>
          </span>
        ))}
      </div>
      <div className="week-v2-calendar__body" style={{ height: `${(CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT}px` }}>
        <div className="week-v2-calendar__time-rail">
          {CALENDAR_HOURS.map((hour) => <span key={hour} style={{ top: `${hour * CALENDAR_HOUR_HEIGHT}px` }}>{formatHourLabel((hour + Math.floor(startOfDayMinutes / 60)) % 24)}</span>)}
          <span className="week-v2-calendar__time-rail-endpoint" style={{ top: `${CALENDAR_END_HOUR * CALENDAR_HOUR_HEIGHT}px` }}>{formatHourLabel(Math.floor(startOfDayMinutes / 60))}</span>
        </div>
        {currentMarkerStyle ? <WeekNowMarker style={currentMarkerStyle} /> : null}
        {rows.map((row) => (
          <div className={`week-v2-calendar__day-column${row.day === todayDay ? ' is-today' : ''}`} key={row.day}>
            {CALENDAR_HOURS.map((hour) => <span className="week-v2-calendar__line" key={`${row.day}-${hour}`} style={{ top: `${hour * CALENDAR_HOUR_HEIGHT}px` }} />)}
            {(events.get(row.day) ?? []).map((event) => <WeekEventCard event={event} key={event.id} />)}
          </div>
        ))}
        {currentMarkerStyle ? (
          <div className="week-v2-calendar__now-marker week-v2-calendar__now-marker--overlay" style={currentMarkerStyle}>
            <span className="week-v2-calendar__now-label">now</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WeekEventCard({ event }: { event: WeekCalendarEvent }) {
  const rawHeight = (event.durationMinutes / 60) * CALENDAR_HOUR_HEIGHT;
  const shortEventMinHeight = event.isGroupedCluster ? 22 : 10;
  const shortEventMaxHeight = event.isGroupedCluster ? 30 : 26;
  const height = event.isShort ? Math.max(shortEventMinHeight, Math.min(shortEventMaxHeight, Math.round(8 + Math.sqrt(event.durationMinutes) * 4))) : Math.max(28, rawHeight - 4);
  const compact = event.isShort || height < 36 || event.laneCount > 2;
  const style: WeekCalendarEventStyle = {
    top: `${(event.topMinutes / 60) * CALENDAR_HOUR_HEIGHT}px`,
    height: `${height}px`,
    left: event.laneCount > 1 ? `calc(${event.lane * 12}px + 4px)` : '4px',
    width: event.laneCount > 1 ? 'calc(100% - 32px)' : 'calc(100% - 8px)',
    zIndex: event.laneCount > 1 ? 10 + event.lane : 3,
    '--event-tone': `var(--category-${event.category.replace('_', '-')})`
  };
  return (
    <article
      aria-label={event.detailTitle.replace(/\n/g, ', ')}
      className={`week-v2-calendar__event week-v2-calendar__event--${event.productivity}${event.isShort ? ' week-v2-calendar__event--short' : ''}${event.isGroupedCluster ? ' week-v2-calendar__event--grouped' : ''}${event.durationMinutes < 10 ? ' week-v2-calendar__event--micro' : ''}${event.laneCount > 2 ? ' week-v2-calendar__event--dense' : ''}${compact ? ' week-v2-calendar__event--compact' : ''}`}
      style={style}
      title={event.detailTitle}
    >
      {event.siteDomain ? <SiteFavicon domain={event.siteDomain} size={14} /> : <span className={`category-dot category-dot--${event.category}`} aria-hidden="true" />}
      <strong className={event.isGroupedCluster ? 'week-v2-calendar__event-label' : undefined}>{event.appName}</strong>
      {!compact ? <small>{event.startLabel}-{event.endLabel}</small> : null}
      {!compact ? <em>{event.detailSummary}</em> : null}
    </article>
  );
}

function WeekNowMarker({ style }: { style: WeekCalendarNowMarkerStyle }) {
  return (
    <div className="week-v2-calendar__now-marker week-v2-calendar__now-marker--line" style={style} aria-hidden="true">
      <span className="week-v2-calendar__now-line" />
      <span className="week-v2-calendar__now-cap" />
    </div>
  );
}

function WeekCategoryLegend({ categories }: { categories: readonly ActivityCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="week-v2-calendar__legend" aria-label="Week category legend">
      {categories.map((category) => (
        <span className="week-v2-calendar__legend-item" key={category}>
          <span className={`category-dot category-dot--${category}`} aria-hidden="true" />
          <span>{DRIFTY_CATEGORY_METADATA[category].label}</span>
        </span>
      ))}
    </div>
  );
}

function WeekCategoryMix({ categories }: { categories: DriftyWeeklyStatsSummary['categoryDurations'] }) {
  return (
    <section className="week-v2-side-card" aria-label="Week totals by category">
      <span className="label-mono">Category mix</span>
      {categories.length > 0 ? (
        <div className="week-v2-cat-list">
          {categories.map((entry) => (
            <div className="week-v2-cat-row" key={entry.category}>
              <div className="week-v2-cat-row__head"><span className={`category-dot category-dot--${entry.category}`} /><strong>{DRIFTY_CATEGORY_METADATA[entry.category].label}</strong><span>{Math.round(entry.ratio * 100)}%</span></div>
              <div className="week-v2-cat-row__bar" aria-hidden="true"><span style={{ width: `${Math.max(entry.ratio * 100, 2)}%` }} /></div>
              <div className="week-v2-cat-row__delta"><span>{secondsToLabel(entry.totalSeconds)}</span><span>of tracked week</span></div>
            </div>
          ))}
        </div>
      ) : <p className="week-v2-empty">No tracked categories yet.</p>}
    </section>
  );
}

function WeekRankedDays({ rows }: { rows: ReturnType<typeof buildWeekDayRows> }) {
  const peakSeconds = Math.max(rows[0]?.totalSeconds ?? 0, 1);
  return (
    <section className="week-v2-side-card" aria-label="Ranked days">
      <span className="label-mono">Ranked days</span>
      <ol className="week-v2-rank">
        {rows.map((row, index) => (
          <li className={row.totalSeconds > 0 ? undefined : 'is-empty'} key={row.day}>
            <span className="week-v2-rank__pos">{String(index + 1).padStart(2, '0')}</span>
            <span className="week-v2-rank__day"><strong>{row.dayName} {row.dayNumber}</strong><small>{row.totalSeconds > 0 ? `Focus ${Math.round((row.focusSeconds / row.totalSeconds) * 100)}%` : 'No activity'}</small></span>
            <span className="week-v2-rank__bar" aria-hidden="true"><span style={{ width: `${row.totalSeconds > 0 ? Math.max((row.totalSeconds / peakSeconds) * 100, 2) : 0}%` }} /></span>
            <span className="week-v2-rank__val">{row.totalSeconds > 0 ? secondsToLabel(row.totalSeconds) : '-'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function weekRange(week: DriftyWeeklyStatsSummary, startOfDayMinutes: number): { readonly startDay: string; readonly endDay: string } {
  const dates = week.days.map((day) => day.date).filter((date): date is string => Boolean(date));
  const endDay = dates.at(-1) ?? logicalDayIsoDateForDate(new Date(), startOfDayMinutes);
  const startDay = dates.length >= 7 ? dates[0] : shiftIsoDate(endDay, -6);
  return { startDay, endDay };
}

function productivityTotal(summary: DriftyStatsSummary, productivity: 'focus' | 'neutral' | 'drift'): number {
  return summary.productivityDurations.find((entry) => entry.productivity === productivity)?.totalSeconds ?? 0;
}

function nowMarkerStyle(currentMinute: number, todayIndex: number): WeekCalendarNowMarkerStyle | null {
  if (todayIndex < 0) return null;
  return {
    '--week-calendar-now-offset': `${(currentMinute / 60) * CALENDAR_HOUR_HEIGHT}px`,
    '--week-calendar-now-line-end': String(todayIndex + 3)
  };
}

function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'am' : 'pm';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${period}`;
}
