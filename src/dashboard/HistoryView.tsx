import { useEffect, useState } from 'react';
import { EmptyState, StatusBox } from '../shared/SurfacePrimitives';
import { AppGlyph, SiteFavicon, domainFromUrl } from './IdentityIcon';

type HistoryRow = {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly lastVisitTime: number;
  readonly visitCount: number;
};

function normalizeHistoryItem(item: chrome.history.HistoryItem): HistoryRow {
  return {
    id: item.id ?? String(item.lastVisitTime),
    url: item.url ?? '',
    title: item.title || item.url || 'Untitled',
    lastVisitTime: item.lastVisitTime ?? 0,
    visitCount: item.visitCount ?? 0
  };
}

function HistoryIdentity({ item }: { item: HistoryRow }) {
  const domain = domainFromUrl(item.url);
  return (
    <span className="history-row__identity usage-identity-icon usage-identity-icon--sm" aria-hidden="true">
      {domain ? <SiteFavicon domain={domain} size={22} /> : <AppGlyph appName={item.title} size="sm" />}
    </span>
  );
}

export function HistoryView() {
  const [historyItems, setHistoryItems] = useState<readonly HistoryRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (typeof chrome === 'undefined' || !chrome.history?.search) {
        if (active) setLoading(false);
        return;
      }

      try {
        const items = await chrome.history.search({ text: '', maxResults: 100, startTime: Date.now() - 7 * 24 * 60 * 60 * 1000 });
        if (!active) return;
        setHistoryItems(items.map(normalizeHistoryItem));
        setLoading(false);
      } catch (error: unknown) {
        if (!(error instanceof Error)) throw error;
        if (active) setLoading(false);
      }
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, []);

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(historyItems.map((item) => item.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function deleteSelected() {
    if (typeof chrome === 'undefined' || !chrome.history?.deleteUrl) return;
    const urls = historyItems.filter((item) => selectedIds.has(item.id) && item.url.length > 0).map((item) => item.url);
    await Promise.all(urls.map((url) => chrome.history.deleteUrl({ url })));
    setHistoryItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
  }

  return (
    <div className="history-tab-surface stack">
      <div className="history-toolbar">
        <button className="button button--secondary" type="button" onClick={selectAll}>Select all</button>
        <button className="button button--secondary" type="button" onClick={clearSelection}>Clear</button>
        {selectedIds.size > 0 ? (
          <button className="button button--primary" type="button" onClick={deleteSelected}>
            Delete {selectedIds.size} selected
          </button>
        ) : null}
      </div>
      {loading ? <StatusBox title="Loading history" detail="Reading Chrome browsing history..." /> : null}
      {historyItems.length > 0 ? (
        <div className="history-list">
          {historyItems.map((item) => (
            <label
              key={item.id}
              className={selectedIds.has(item.id) ? 'history-row history-row--selected' : 'history-row'}
              htmlFor={`history-${item.id}`}
            >
              <input
                id={`history-${item.id}`}
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelection(item.id)}
              />
              <HistoryIdentity item={item} />
              <div className="history-row__content">
                <strong className="truncate">{item.title}</strong>
                <span className="muted truncate">{item.url}</span>
              </div>
              <span className="measure">{new Date(item.lastVisitTime).toLocaleDateString()}</span>
            </label>
          ))}
        </div>
      ) : !loading ? (
        <EmptyState title="No history found" detail="Chrome browsing history appears here after you browse." />
      ) : null}
    </div>
  );
}
