import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ActivityCategory, ActivitySegment } from '../lib/domain';
import type { DriftyBrowserCategory, DriftyStatsSummary, DriftyWeeklyStatsSummary } from '../lib/drifty';
import { formatDuration, formatTimeLabel } from '../shared/format';
import {
  activityDetailsId,
  buildActivityRows,
  buildCategoryBreakdowns,
  buildSourceSummaries,
  captureSurfaceDetails,
  categoryLabel,
  classificationRowSummary,
  formatSourceProductivityMix,
  productivityLabel,
  segmentCategory,
  segmentProductivity,
  sourceIdentity,
  type ClassificationActivityRow
} from './classificationViewModel';

type ClassificationRange = 'today' | 'week';

type ClassificationData = {
  today: DriftyStatsSummary;
  week: DriftyWeeklyStatsSummary;
  categories: DriftyBrowserCategory[];
};

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

export function ClassificationView({ data }: { data: ClassificationData }) {
  const [range, setRange] = useState<ClassificationRange>('today');
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const summary = range === 'today' ? data.today : data.week;
  const categoryBreakdowns = useMemo(() => buildCategoryBreakdowns(summary.segments), [summary.segments]);
  const effectiveCategory = selectedCategory ?? categoryBreakdowns[0]?.category ?? null;
  const categorySegments = useMemo(
    () => summary.segments.filter((segment) => effectiveCategory && segmentCategory(segment) === effectiveCategory),
    [effectiveCategory, summary.segments]
  );
  const sourceSummaries = useMemo(() => buildSourceSummaries(categorySegments), [categorySegments]);
  const effectiveSourceId = selectedSourceId ?? sourceSummaries[0]?.id ?? null;
  const selectedSource = sourceSummaries.find((source) => source.id === effectiveSourceId) ?? null;
  const sourceSegments = useMemo(
    () => categorySegments.filter((segment) => sourceIdentity(segment).id === effectiveSourceId),
    [categorySegments, effectiveSourceId]
  );
  const activityRows = useMemo(() => buildActivityRows(sourceSegments), [sourceSegments]);
  const activityPeakSeconds = activityRows[0]?.totalSeconds ?? 0;
  const selectedTone = effectiveCategory ? categoryToneColor[effectiveCategory] : 'var(--accent)';
  const panelStyle = { '--classification-selected-tone': selectedTone } as CSSProperties & Record<'--classification-selected-tone', string>;

  useEffect(() => {
    if (effectiveCategory && selectedCategory !== effectiveCategory) setSelectedCategory(effectiveCategory);
  }, [effectiveCategory, selectedCategory]);

  useEffect(() => {
    if (effectiveSourceId && selectedSourceId !== effectiveSourceId) setSelectedSourceId(effectiveSourceId);
  }, [effectiveSourceId, selectedSourceId]);

  useEffect(() => {
    setExpandedRows(new Set(activityRows.filter((row) => row.hasDetails).slice(0, 1).map((row) => row.id)));
  }, [activityRows]);

  if (categoryBreakdowns.length === 0) {
    return (
      <section className="classification-panel-view" aria-label="Classification panel view">
        <div className="classification-panel-view__empty classification-panel-view__empty--full">
          <span className="label-mono">Classification</span>
          <strong>No classified activity yet</strong>
          <p>Local browser sessions will appear here once the extension records activity.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="classification-panel-view" aria-label="Classification panel view" style={panelStyle}>
      <div className="classification-panel-view__range seg classification-range-control" aria-label="Classification range">
        {(['today', 'week'] as const).map((option) => (
          <button className={range === option ? 'on' : ''} key={option} type="button" aria-pressed={range === option} onClick={() => setRange(option)}>
            {option === 'today' ? 'Today' : 'Week'}
          </button>
        ))}
      </div>
      <div className="classification-panel-view__grid">
        <section className="classification-panel-view__panel" aria-label="Categories">
          <header className="classification-panel-view__panel-header panel-header">
            <div className="panel-header__left">
              <span className="label-mono">Categories</span>
              <strong className="panel-header__title">{categoryBreakdowns.length} tracked</strong>
            </div>
            <div className="panel-header__right">
              <span className="panel-header__meta">Total</span>
              <strong className="panel-header__value">{formatDuration(summary.totalSeconds)}</strong>
            </div>
          </header>
          <div className="classification-panel-view__panel-body">
            <div className="classification-panel-view__list" role="list">
              {categoryBreakdowns.map((breakdown) => (
                <CategoryRow
                  key={breakdown.category}
                  category={breakdown.category}
                  totalSeconds={breakdown.totalSeconds}
                  peakSeconds={categoryBreakdowns[0]?.totalSeconds ?? 0}
                  selected={breakdown.category === effectiveCategory}
                  onSelect={() => {
                    setSelectedCategory(breakdown.category);
                    setSelectedSourceId(null);
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="classification-panel-view__panel" aria-label="Apps and sites">
          <header className="classification-panel-view__panel-header panel-header">
            <div className="panel-header__left">
              <span className="label-mono">Apps &amp; Sites</span>
              <strong className="panel-header__title">{effectiveCategory ? categoryLabel(effectiveCategory) : 'No category'}</strong>
            </div>
            <div className="panel-header__right">
              <span className="panel-header__meta">{sourceSummaries.length === 1 ? 'source' : 'sources'}</span>
              <strong className="panel-header__value">{sourceSummaries.length}</strong>
            </div>
          </header>
          <div className="classification-panel-view__panel-body">
            <div className="classification-panel-view__list" role="list">
              {sourceSummaries.map((source) => (
                <button key={source.id} type="button" className="classification-panel-view__source-row" data-selected={String(source.id === effectiveSourceId)} aria-pressed={source.id === effectiveSourceId} onClick={() => setSelectedSourceId(source.id)}>
                  <div className="classification-panel-view__source-icon">
                    {source.usageKind === 'site' && source.siteDomain ? <SiteFavicon domain={source.siteDomain} size={24} /> : <AppGlyph appName={source.appName} />}
                  </div>
                  <div className="classification-panel-view__source-copy">
                    <strong>{source.label}</strong>
                    <div className="classification-panel-view__source-meta">
                      <span>{source.sessionCount} {source.sessionCount === 1 ? 'session' : 'sessions'} · {formatDuration(source.averageSessionSeconds)} avg</span>
                      <span className="classification-panel-view__source-productivity" aria-label={formatSourceProductivityMix(source.productivityMix)} title={formatSourceProductivityMix(source.productivityMix)}>
                        {source.productivityMix.map((entry) => (
                          <span key={entry.productivity} className={`classification-panel-view__source-productivity-dot classification-panel-view__source-productivity-dot--${entry.productivity}`} style={{ width: `${Math.max(7, Math.round(entry.ratio * 18))}px` }} aria-hidden="true" />
                        ))}
                      </span>
                    </div>
                  </div>
                  <div className="classification-panel-view__source-measure">
                    <strong>{formatDuration(source.totalSeconds)}</strong>
                    <span>{formatSourceShare(source.shareOfTotal)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="classification-panel-view__panel classification-panel-view__panel--detail" aria-label="Activity details">
          {selectedSource ? (
            <>
              <header className="classification-panel-view__panel-header panel-header">
                <div className="panel-header__left">
                  <span className="label-mono">Activity details</span>
                  <strong className="panel-header__title">{selectedSource.label}</strong>
                </div>
                <div className="panel-header__right classification-panel-view__detail-meta">
                  <span className="panel-header__meta">{selectedSource.sessionCount} {selectedSource.sessionCount === 1 ? 'session' : 'sessions'}</span>
                  <strong className="panel-header__value">{formatDuration(selectedSource.totalSeconds)}</strong>
                </div>
              </header>
              <div className="classification-panel-view__panel-body">
                <div className="classification-panel-view__list" role="list">
                  {activityRows.map((row) => (
                    <ActivityRow key={row.id} row={row} peakSeconds={activityPeakSeconds} selectedTone={selectedTone} expanded={expandedRows.has(row.id)} onToggle={() => {
                      setExpandedRows((current) => {
                        const next = new Set(current);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      });
                    }} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="classification-panel-view__empty">
              <span className="label-mono">Activity details</span>
              <strong>Select an app or site to see activity details.</strong>
              <p>Choose a source from the middle panel to inspect its titles, pages, and time distribution.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function CategoryRow({ category, totalSeconds, peakSeconds, selected, onSelect }: { category: ActivityCategory; totalSeconds: number; peakSeconds: number; selected: boolean; onSelect: () => void }) {
  const barWidth = Math.max((totalSeconds / Math.max(peakSeconds, 1)) * 100, 4);
  return (
    <button type="button" className="classification-panel-view__category-row" data-selected={String(selected)} aria-pressed={selected} onClick={onSelect}>
      <div className="classification-panel-view__row-top">
        <div className="classification-panel-view__row-title">
          <span className={`category-dot category-dot--${category}`} aria-hidden="true" />
          <strong>{categoryLabel(category)}</strong>
        </div>
        <span>{formatDuration(totalSeconds)}</span>
      </div>
      <div className="classification-panel-view__bar" aria-hidden="true">
        <span style={{ width: `${barWidth}%`, background: categoryToneColor[category] }} />
      </div>
    </button>
  );
}

function ActivityRow({ row, peakSeconds, selectedTone, expanded, onToggle }: { row: ClassificationActivityRow; peakSeconds: number; selectedTone: string; expanded: boolean; onToggle: () => void }) {
  const detailsId = activityDetailsId(row.id);
  const rowSummary = <ActivityRowSummary row={row} peakSeconds={peakSeconds} selectedTone={selectedTone} />;
  return (
    <div className="classification-panel-view__activity-row" role="listitem" data-expandable={String(row.hasDetails)} data-expanded={String(expanded)}>
      {row.hasDetails ? (
        <button type="button" className="classification-panel-view__activity-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>
          {rowSummary}
          <span className="sr-only">Capture details {expanded ? 'expanded' : 'collapsed'}</span>
          <span className="classification-panel-view__activity-chevron" aria-hidden="true">{expanded ? '⌄' : '>'}</span>
        </button>
      ) : <div className="classification-panel-view__activity-summary">{rowSummary}</div>}
      {expanded ? <ActivityDetails row={row} detailsId={detailsId} /> : null}
    </div>
  );
}

function ActivityRowSummary({ row, peakSeconds, selectedTone }: { row: ClassificationActivityRow; peakSeconds: number; selectedTone: string }) {
  const rowMeta = `${row.count} ${row.count === 1 ? 'activity' : 'activities'} · ${row.startedLabel} - ${row.endedLabel}`;
  return (
    <>
      <div className="classification-panel-view__activity-copy">
        <strong title={row.label}>{row.label}</strong>
        <span title={rowMeta}>{rowMeta}</span>
      </div>
      <div className="classification-panel-view__activity-measure">
        <div className="classification-panel-view__bar" aria-hidden="true">
          <span style={{ width: `${Math.max((row.totalSeconds / Math.max(peakSeconds, 1)) * 100, 4)}%`, background: selectedTone }} />
        </div>
        <strong>{formatDuration(row.totalSeconds)}</strong>
      </div>
    </>
  );
}

function ActivityDetails({ row, detailsId }: { row: ClassificationActivityRow; detailsId: string }) {
  const details = captureSurfaceDetails(row.segments);
  const summary = classificationRowSummary(row.segments);
  return (
    <div id={detailsId} className="classification-panel-view__activity-details" role="region" aria-label={`Capture details for ${row.label}`}>
      <div className="classification-panel-view__activity-overview">
        {details.length > 0 ? (
          <div className="classification-panel-view__activity-surface" aria-label="Capture surface">
            <span className="label-mono">Surface</span>
            <div className="classification-panel-view__activity-surface-list">{details.map((detail) => <span key={detail}>{detail}</span>)}</div>
          </div>
        ) : null}
        {summary ? (
          <dl className="classification-panel-view__activity-classification" aria-label="Classification summary">
            <div><dt>Category</dt><dd>{summary.categoryLabel}</dd></div>
            <div><dt>Productivity</dt><dd>{summary.productivityLabel}</dd></div>
            <div><dt>Source</dt><dd>{summary.sourceLabel}</dd></div>
            <div><dt>Confidence</dt><dd>{summary.confidenceLabel}</dd></div>
          </dl>
        ) : null}
      </div>
      <div className="classification-panel-view__capture-timeline">
        <span className="label-mono">Capture slices</span>
        <div className="classification-panel-view__capture-slice-list" role="list" aria-label={`Capture slices for ${row.label}`}>
          {row.segments.map((segment, index) => <CaptureSlice key={segment.id} segment={segment} index={index} />)}
        </div>
      </div>
    </div>
  );
}

function CaptureSlice({ segment, index }: { segment: ActivitySegment; index: number }) {
  const label = segment.windowTitle || segment.siteTitle || segment.siteDomain || segment.appName;
  const range = `${formatTimeLabel(segment.startedAt)} - ${formatTimeLabel(segment.endedAt)}`;
  return (
    <div className="classification-panel-view__capture-slice" role="listitem" aria-label={`Capture slice ${index + 1}: ${label}, ${range}, ${formatDuration(segment.durationSeconds)}`}>
      <div className="classification-panel-view__capture-slice-copy">
        <strong className="classification-panel-view__capture-slice-title" title={label}>{label}</strong>
        <span className="classification-panel-view__capture-slice-time">{range} · {categoryLabel(segmentCategory(segment))} · {productivityLabel(segmentProductivity(segment))}</span>
      </div>
      <strong className="classification-panel-view__capture-slice-duration">{formatDuration(segment.durationSeconds)}</strong>
    </div>
  );
}

function SiteFavicon({ domain, size }: { domain: string; size: number }) {
  const source = typeof chrome !== 'undefined' && chrome.runtime?.id ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(`https://${domain}`)}&size=64` : null;
  const style = { '--identity-icon-size': `${size}px`, '--app-glyph-color': colorForApp(domain) } as CSSProperties & Record<'--identity-icon-size' | '--app-glyph-color', string>;
  return source ? <img className="site-favicon" src={source} alt="" width={size} height={size} style={style} /> : <div className="site-favicon site-favicon--fallback" style={style} aria-hidden="true">{domain[0]?.toUpperCase() ?? '?'}</div>;
}

function AppGlyph({ appName }: { appName: string }) {
  const style = { '--app-glyph-color': colorForApp(appName) } as CSSProperties & Record<'--app-glyph-color', string>;
  return <div className="app-glyph app-glyph--sm" style={style} aria-hidden="true"><span>{appName.slice(0, 2).toUpperCase()}</span></div>;
}

function colorForApp(appName: string) {
  let hash = 0;
  for (const char of appName) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 56%)`;
}

function formatSourceShare(share: number): string {
  const percentage = share * 100;
  return percentage >= 10 ? `${Math.round(percentage)}%` : `${percentage.toFixed(1)}%`;
}
