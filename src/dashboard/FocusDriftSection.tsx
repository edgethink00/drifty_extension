import { useMemo, useState } from 'react';
import type { ActivitySegment } from '../lib/domain';
import { formatDuration } from '../shared/format';
import {
  FOCUS_DRIFT_CHART_BOUNDS,
  FOCUS_DRIFT_GRID_PATH,
  buildFocusDriftChart,
  type FocusDriftPoint
} from './focusDriftModel';

type HoverState = { point: FocusDriftPoint; kind: 'focus' | 'drift' } | null;

export function FocusDriftSection({
  segments,
  day,
  currentMinuteOfDay,
  startOfDayMinutes,
  dayTotalSeconds,
  daySegmentCount,
  currentSessionLabel,
  currentSessionDurationSeconds
}: {
  segments: ActivitySegment[];
  day: string;
  currentMinuteOfDay: number | null;
  startOfDayMinutes: number;
  dayTotalSeconds: number;
  daySegmentCount: number;
  currentSessionLabel: string | null;
  currentSessionDurationSeconds: number | null;
}) {
  const chart = useMemo(
    () => buildFocusDriftChart(segments, day, currentMinuteOfDay, startOfDayMinutes),
    [segments, day, currentMinuteOfDay, startOfDayMinutes]
  );
  const [hover, setHover] = useState<HoverState>(null);

  // The day summary (Local time, sessions, current) shows whenever there is tracked time,
  // even if there is not yet a focus/drift split to plot — so totals never disappear.
  if (dayTotalSeconds <= 0) return null;

  const activeTargets = chart.points.filter((point) => !point.isFuture && point.totalSeconds > 0);

  return (
    <section className="focus-drift-card" aria-label="Focus versus drift across the day">
      <div className="focus-drift-card__head">
        <span className="label-mono">Focus vs drift · 30m windows</span>
        <div className="focus-drift-card__legend" aria-hidden="true">
          <span className="focus-drift-card__legend-item focus-drift-card__legend-item--focus">Focus</span>
          <span className="focus-drift-card__legend-item focus-drift-card__legend-item--drift">Drift</span>
        </div>
      </div>

      <div className="focus-drift-card__layout">
      {/* The graph frame (grid + axis + now line) always renders so "Your Day" always shows the
          focus/drift chart, like drifty_mac — curves fill in as focus/drift windows accumulate. */}
      <div className="focus-drift-card__chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Focus and drift share by 30-minute windows${chart.isLive && chart.currentTimeLabel ? `, live through ${chart.currentTimeLabel}` : ''}`}>
          <path className="focus-drift__grid" d={FOCUS_DRIFT_GRID_PATH} />
          {chart.focusAreaPath ? <path className="focus-drift__area" d={chart.focusAreaPath} /> : null}
          {chart.driftPath ? <path className="focus-drift__line focus-drift__line--drift" d={chart.driftPath} /> : null}
          {chart.focusPath ? <path className="focus-drift__line focus-drift__line--focus" d={chart.focusPath} /> : null}
          {chart.currentX !== null ? (
            <line className="focus-drift__now" x1={chart.currentX} x2={chart.currentX} y1={FOCUS_DRIFT_CHART_BOUNDS.top} y2={FOCUS_DRIFT_CHART_BOUNDS.bottom} />
          ) : null}
          {activeTargets.map((point) => (
            <g key={point.id}>
              <circle
                className="focus-drift__target focus-drift__target--focus"
                cx={point.x}
                cy={point.focusY}
                r={hover?.point.id === point.id ? 2.4 : 1.6}
                onMouseEnter={() => setHover({ point, kind: 'focus' })}
                onMouseLeave={() => setHover(null)}
              />
              <circle
                className="focus-drift__target focus-drift__target--drift"
                cx={point.x}
                cy={point.driftY}
                r={hover?.point.id === point.id ? 2.4 : 1.6}
                onMouseEnter={() => setHover({ point, kind: 'drift' })}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
        <div className="focus-drift-card__axis" aria-hidden="true">
          {chart.axisTicks.filter((_, index) => index % 2 === 0).map((tick) => (
            <span key={tick.id} style={{ left: `${((tick.x - FOCUS_DRIFT_CHART_BOUNDS.left) / (FOCUS_DRIFT_CHART_BOUNDS.right - FOCUS_DRIFT_CHART_BOUNDS.left)) * 100}%` }}>{tick.label}</span>
          ))}
        </div>
        {!chart.hasData ? <p className="focus-drift-card__chart-note muted">{chart.isLive ? 'Focus and drift fill in as you browse today.' : 'No focus or drift recorded this day.'}</p> : null}
        {hover ? (
          <div className="focus-drift-card__hover" role="status">
            <strong>{hover.point.label}</strong>
            <span className="focus-drift-card__hover-focus">Focus {Math.round(hover.point.focusScore)}% · {formatDuration(hover.point.focusSeconds)}</span>
            <span className="focus-drift-card__hover-drift">Drift {Math.round(hover.point.driftScore)}% · {formatDuration(hover.point.driftSeconds)}</span>
            {hover.point.topFocusSource ? <span className="muted">Top focus: {hover.point.topFocusSource.label}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="focus-drift-card__kpis focus-drift-card__kpis--column" aria-label="Day summary">
        <div className="focus-drift-card__kpi">
          <span className="eyebrow">Local time</span>
          <strong>{formatDuration(dayTotalSeconds)}</strong>
          <span className="muted">{daySegmentCount} {daySegmentCount === 1 ? 'session' : 'sessions'}</span>
        </div>
        <div className="focus-drift-card__kpi">
          <span className="eyebrow">Focus consistency</span>
          <strong>{chart.focusConsistency}%</strong>
          <span className="muted">of tracked windows</span>
        </div>
        <div className="focus-drift-card__kpi">
          <span className="eyebrow">Peak focus</span>
          <strong>{chart.peakFocusPoint ? `${Math.round(chart.peakFocusPoint.focusScore)}%` : '—'}</strong>
          <span className="muted">{chart.peakFocusPoint ? `at ${chart.peakFocusPoint.label}` : 'No focus yet'}</span>
        </div>
        <div className="focus-drift-card__kpi">
          <span className="eyebrow">Current</span>
          <strong>{currentSessionDurationSeconds !== null ? formatDuration(currentSessionDurationSeconds) : 'Idle'}</strong>
          <span className="muted truncate">{currentSessionLabel ?? 'No active session'}</span>
        </div>
      </div>
      </div>
    </section>
  );
}
