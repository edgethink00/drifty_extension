import type { ActivitySegment } from '../domain';
import { legacyCategoryClassification, type LegacyCategory } from './legacyMapping';

export type LegacyVisit = {
  url?: string | null;
  title?: string | null;
  timestamp?: number | string | null;
  category?: LegacyCategory | null;
  favIconUrl?: string | null;
  iconSrc?: string | null;
};

export type LegacySession = {
  id?: string | number | null;
  category?: LegacyCategory | null;
  startTime?: number | string | null;
  endTime?: number | string | null;
  lastVisitTime?: number | string | null;
  duration?: number | null;
  visits?: LegacyVisit[] | null;
  source?: string | null;
  favIconUrl?: string | null;
  iconSrc?: string | null;
  appIconSrc?: string | null;
};

export type LegacyCurrentSessionResponse = {
  session?: LegacySession | null;
  state?: string | null;
} | LegacySession | null;

function sanitizeIconSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith('chrome-extension://')) return raw;
  if (raw.startsWith('data:')) return raw;
  if (raw.startsWith('blob:')) return raw;
  return null;
}

export type BrowserPlatform = ActivitySegment['platform'];

const DEFAULT_BROWSER_NAME = 'Chrome';

function isCurrentSessionWrapper(response: NonNullable<LegacyCurrentSessionResponse>): response is { session?: LegacySession | null; state?: string | null } {
  return 'session' in response;
}

function coerceTimeMs(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toIsoString(value: number): string {
  return new Date(value).toISOString();
}

function firstVisitWithUrl(visits: LegacyVisit[]): LegacyVisit | null {
  return visits.find((visit) => Boolean(visit.url)) ?? visits[0] ?? null;
}

function siteDomainFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function detectBrowserPlatform(): BrowserPlatform {
  if (typeof navigator === 'undefined') {
    return 'windows';
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('android')) return 'android';
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'ios';
  if (userAgent.includes('mac os')) return 'macos';
  return 'windows';
}

export function legacySessionToActivitySegment(session: LegacySession, nowMs = Date.now()): ActivitySegment {
  const visits = session.visits ?? [];
  const firstVisit = firstVisitWithUrl(visits);
  const startedAtMs = coerceTimeMs(session.startTime) ?? coerceTimeMs(firstVisit?.timestamp) ?? nowMs;
  const finiteDurationMs = typeof session.duration === 'number' && Number.isFinite(session.duration) ? session.duration : null;
  const endedAtMs = coerceTimeMs(session.endTime) ?? coerceTimeMs(session.lastVisitTime) ?? (finiteDurationMs === null ? nowMs : startedAtMs + finiteDurationMs);
  const durationMs = finiteDurationMs ?? Math.max(0, endedAtMs - startedAtMs);
  const siteUrl = firstVisit?.url ?? null;

  const iconSrc = sanitizeIconSrc(session.appIconSrc ?? session.iconSrc ?? session.favIconUrl ?? firstVisit?.iconSrc ?? firstVisit?.favIconUrl);

  return {
    id: String(session.id ?? `browser-session-${startedAtMs}`),
    startedAt: toIsoString(startedAtMs),
    endedAt: toIsoString(Math.max(startedAtMs, endedAtMs)),
    durationSeconds: Math.max(0, Math.round(durationMs / 1000)),
    appName: DEFAULT_BROWSER_NAME,
    bundleId: null,
    windowTitle: firstVisit?.title ?? null,
    browserName: DEFAULT_BROWSER_NAME,
    siteDomain: siteDomainFromUrl(siteUrl),
    siteTitle: firstVisit?.title ?? null,
    siteUrl,
    siteSource: siteUrl ? 'window-title' : 'unknown',
    platform: detectBrowserPlatform(),
    source: 'unknown',
    confidence: null,
    classification: legacyCategoryClassification(session.category),
    ...(iconSrc ? { appIconSrc: iconSrc, iconSrc } : {})
  };
}

export function legacySessionsToActivitySegments(sessions: LegacySession[] | null | undefined): ActivitySegment[] {
  return (sessions ?? []).map((session) => legacySessionToActivitySegment(session));
}

export function currentLegacySessionToActivitySegment(response: LegacyCurrentSessionResponse): ActivitySegment | null {
  if (!response) {
    return null;
  }

  const session = isCurrentSessionWrapper(response) ? response.session : response;
  return session ? legacySessionToActivitySegment(session) : null;
}
