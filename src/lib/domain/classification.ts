import type { ActivityCategory, ActivityClassificationDetail, ActivitySegment, ClassificationSource, ProductivityLabel } from './activity';

const DOMAIN_CATEGORY_HINTS: ReadonlyArray<readonly [RegExp, ActivityCategory, ProductivityLabel]> = [
  [/github|gitlab|linear|notion|figma|docs\.google|slack|localhost/i, 'workspace', 'focus'],
  [/chatgpt|claude|openai|stackoverflow|developer|learn|course|udemy|coursera|wikipedia/i, 'learning', 'focus'],
  [/gmail|mail|discord|telegram|whatsapp|messenger|zoom|meet/i, 'communication', 'neutral'],
  [/spotify|music|soundcloud/i, 'music', 'neutral'],
  [/youtube|netflix|twitch|hulu|disney|primevideo/i, 'entertainment', 'drift'],
  [/x\.com|twitter|instagram|facebook|reddit|tiktok|threads/i, 'social_media', 'drift'],
  [/amazon|shop|store|ebay|coupang/i, 'shopping', 'drift'],
  [/steam|epicgames|roblox|game/i, 'game', 'drift']
];

const APP_CATEGORY_HINTS: ReadonlyArray<readonly [RegExp, ActivityCategory, ProductivityLabel]> = [
  [/code|cursor|xcode|terminal|iterm|warp|github/i, 'workspace', 'focus'],
  [/chrome|safari|arc|firefox|edge/i, 'utility', 'neutral'],
  [/slack|discord|mail|messages|zoom|meet/i, 'communication', 'neutral'],
  [/spotify|music/i, 'music', 'neutral'],
  [/steam|minecraft|game/i, 'game', 'drift']
];

export function classifyActivityDetailed(segment: ActivitySegment): ActivityClassificationDetail {
  if (segment.classification) {
    return {
      category: segment.classification.category,
      productivity: segment.classification.productivity,
      source: segment.classification.source,
      confidence: segment.classification.confidence
    };
  }

  const domain = segment.siteDomain ?? segment.siteUrl ?? segment.siteTitle ?? '';
  const domainMatch = DOMAIN_CATEGORY_HINTS.find(([pattern]) => pattern.test(domain));
  if (domainMatch) return detailFromMatch(domainMatch, 'domain-db', 0.72);

  const appMatch = APP_CATEGORY_HINTS.find(([pattern]) => pattern.test(segment.appName));
  if (appMatch) return detailFromMatch(appMatch, 'app-db', 0.62);

  return { category: 'unknown', productivity: 'neutral', source: 'fallback', confidence: 0.3 };
}

function detailFromMatch(
  match: readonly [RegExp, ActivityCategory, ProductivityLabel],
  source: ClassificationSource,
  confidence: number
): ActivityClassificationDetail {
  return {
    category: match[1],
    productivity: match[2],
    source,
    confidence
  };
}
