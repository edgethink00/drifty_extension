import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

type IdentityIconStyle = CSSProperties & Record<'--identity-icon-size' | '--app-glyph-color', string>;

function colorForIdentity(label: string): string {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 56%)`;
}

function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function faviconUrlForDomain(domain: string): string | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=64`;
}

export function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (error: unknown) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export function SiteFavicon({ domain, size, fallbackIconSrc }: { domain: string; size: number; fallbackIconSrc?: string | null }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => {
    const nextSources: string[] = [];
    const faviconSource = faviconUrlForDomain(domain);
    if (faviconSource) nextSources.push(faviconSource);
    if (fallbackIconSrc) nextSources.push(fallbackIconSrc);
    return nextSources;
  }, [domain, fallbackIconSrc]);
  const style: IdentityIconStyle = {
    '--identity-icon-size': `${size}px`,
    '--app-glyph-color': colorForIdentity(domain)
  };

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  if (sourceIndex >= sources.length) {
    return <div className="site-favicon site-favicon--fallback" style={style} aria-hidden="true">{domain[0]?.toUpperCase() ?? '*'}</div>;
  }

  return <img className="site-favicon" src={sources[sourceIndex]} alt="" width={size} height={size} style={style} onError={() => setSourceIndex((current) => current + 1)} />;
}

export function AppGlyph({ appName, size = 'sm', iconSrc }: { appName: string; size?: 'sm' | 'md' | 'lg'; iconSrc?: string | null }) {
  const style: CSSProperties & Record<'--app-glyph-color', string> = { '--app-glyph-color': colorForIdentity(appName) };
  if (iconSrc) return <img className={`app-icon app-icon--${size}`} src={iconSrc} alt="" aria-hidden="true" />;
  return <div className={`app-glyph app-glyph--${size}`} style={style} aria-hidden="true"><span>{initials(appName)}</span></div>;
}
