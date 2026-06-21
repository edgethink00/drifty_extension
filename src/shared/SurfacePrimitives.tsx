import type { CSSProperties, ReactNode } from 'react';
import { formatDuration, formatPercent } from './format';

export type ToneItem = {
  label: string;
  seconds: number;
  ratio: number;
  color: string;
  meta?: string;
};

type PanelProps = {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  flat?: boolean;
};

export function Panel({ title, eyebrow, action, children, flat = false }: PanelProps) {
  return (
    <section className={`card editorial-panel${flat ? ' card--flat editorial-panel--flat' : ''}`}>
      <div className="card__body editorial-panel__body">
        {title || eyebrow || action ? (
          <div className="card__header section-heading">
            <div className="stack-tight">
              {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
              {title ? <h2>{title}</h2> : null}
            </div>
            {action}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

type MetricProps = {
  label: string;
  value: string;
  detail?: string;
};

export function Metric({ label, value, detail }: MetricProps) {
  return (
    <div className="metric metric-tile">
      <span className="eyebrow">{label}</span>
      <strong className="measure">{value}</strong>
      {detail ? <p className="muted truncate">{detail}</p> : null}
    </div>
  );
}

export function StatusBox({ title, detail, kind = 'default' }: { title: string; detail: string; kind?: 'default' | 'error' }) {
  return (
    <div className={`status-box${kind === 'error' ? ' status-box--error' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <p className="muted">{detail}</p>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p className="muted">{detail}</p>
    </div>
  );
}

export function ToneBars({ items, emptyTitle, emptyDetail }: { items: ToneItem[]; emptyTitle: string; emptyDetail: string }) {
  const visibleItems = items.filter((item) => item.seconds > 0);

  if (visibleItems.length === 0) {
    return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  }

  return (
    <div className="bars">
      {visibleItems.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-row__meta">
            <span className="truncate">{item.label}</span>
            <span className="muted measure">{formatDuration(item.seconds)} · {formatPercent(item.ratio)}</span>
          </div>
          <div className="bar" role="img" aria-label={`${item.label} ${formatDuration(item.seconds)} ${formatPercent(item.ratio)}`}>
            <span style={{ '--bar-value': formatPercent(item.ratio), '--bar-color': item.color } as CSSProperties} />
          </div>
          {item.meta ? <span className="muted truncate">{item.meta}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function PrivacyPills({ runtimeReady }: { runtimeReady: boolean }) {
  return (
    <div className="pill-row" aria-label="Privacy status">
      <span className="pill"><span className="dot" />Local device ledger</span>
      <span className="pill">Raw history stays in this browser</span>
      <span className="pill">Extension reader {runtimeReady ? 'ready' : 'pending'}</span>
    </div>
  );
}

export type NavItem = {
  id: string;
  label: string;
  icon: 'home' | 'calendar' | 'classify' | 'history' | 'settings';
  detail?: string;
};

function NavIcon({ type }: { type: NavItem['icon'] }) {
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, width: 14, height: 14 };
  switch (type) {
    case 'home':
      return <svg {...props}><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></svg>;
    case 'calendar':
      return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M8 14h2M14 14h2M8 17h2" /></svg>;
    case 'classify':
      return <svg {...props}><path d="M4 5h16M4 12h10M4 19h14" /><circle cx="18" cy="12" r="2" /><circle cx="20" cy="19" r="2" /></svg>;
    case 'history':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
  }
}

export function Sidebar({
  activeTab,
  onTabChange,
  navItems,
  logoSrc
}: {
  activeTab: string;
  onTabChange: (id: string) => void;
  navItems: Array<{ section: string; items: NavItem[] }>;
  logoSrc?: string;
}) {
  return (
    <aside className="sidebar" aria-label="Dashboard navigation">
      <div className="brand" aria-label="Drifty">
        {logoSrc ? <img className="brand__logo" src={logoSrc} alt="" aria-hidden="true" /> : null}
        <div className="brand__dot" aria-hidden="true" />
      </div>
      {navItems.map((section) => (
        <div key={section.section}>
          <div className="nav-label">{section.section}</div>
          <nav className="sidebar-nav" aria-label={section.section}>
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeTab === item.id ? 'nav-item nav-item--active' : 'nav-item'}
                onClick={() => onTabChange(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
              >
                <NavIcon type={item.icon} />
                <span>{item.label}{item.detail ? <small>{item.detail}</small> : null}</span>
              </button>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
