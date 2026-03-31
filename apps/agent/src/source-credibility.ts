/**
 * Source credibility scoring for web search results.
 *
 * Maps known domains to credibility tiers so the LLM can weigh
 * authoritative sources (e.g. Wikipedia for music history) more heavily.
 * Unknown domains receive no annotation to avoid negative bias.
 */

interface CredibilityInfo {
  tier: 1 | 2;
  label: string;
  name: string;
}

const DOMAIN_CREDIBILITY: Record<string, CredibilityInfo> = {
  // Tier 1 — authoritative music databases & encyclopedias
  "wikipedia.org": { tier: 1, label: "High Credibility", name: "Wikipedia" },
  "allmusic.com": { tier: 1, label: "High Credibility", name: "AllMusic" },
  "discogs.com": { tier: 1, label: "High Credibility", name: "Discogs" },
  "musicbrainz.org": { tier: 1, label: "High Credibility", name: "MusicBrainz" },

  // Tier 1 — Chinese authoritative sources
  "baike.baidu.com": { tier: 1, label: "High Credibility", name: "百度百科" },
  "douban.com": { tier: 1, label: "High Credibility", name: "豆瓣" },

  // Tier 2 — reputable music journalism & reference
  "pitchfork.com": { tier: 2, label: "Medium Credibility", name: "Pitchfork" },
  "rollingstone.com": { tier: 2, label: "Medium Credibility", name: "Rolling Stone" },
  "nme.com": { tier: 2, label: "Medium Credibility", name: "NME" },
  "billboard.com": { tier: 2, label: "Medium Credibility", name: "Billboard" },
  "genius.com": { tier: 2, label: "Medium Credibility", name: "Genius" },

  // Tier 2 — Chinese music platforms & reference
  "music.163.com": { tier: 2, label: "Medium Credibility", name: "网易云音乐" },
  "y.qq.com": { tier: 2, label: "Medium Credibility", name: "QQ音乐" },
};

/**
 * Look up credibility info for a URL by trying progressively shorter
 * domain suffixes. This handles subdomain-specific entries like
 * "baike.baidu.com" or "music.163.com" while still matching plain
 * domains like "wikipedia.org".
 */
function lookupCredibility(url: string): CredibilityInfo | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const parts = hostname.split(".");
    // Try from full hostname down to registrable domain (last 2 segments)
    // e.g. "baike.baidu.com" → try "baike.baidu.com", then "baidu.com"
    for (let i = 0; i <= parts.length - 2; i++) {
      const candidate = parts.slice(i).join(".");
      const info = DOMAIN_CREDIBILITY[candidate];
      if (info) return info;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the credibility label for a URL, or null if the domain is unknown.
 */
export function getCredibilityLabel(url: string): string | null {
  const info = lookupCredibility(url);
  if (!info) return null;
  return `[${info.label} - ${info.name}]`;
}

/**
 * Return a title string annotated with a credibility tag (if recognized).
 * Unknown domains return the title unchanged.
 */
export function annotateSearchResult(title: string, url: string): string {
  const label = getCredibilityLabel(url);
  return label ? `${title} ${label}` : title;
}
