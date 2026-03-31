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

  // Tier 2 — reputable music journalism & reference
  "pitchfork.com": { tier: 2, label: "Medium Credibility", name: "Pitchfork" },
  "rollingstone.com": { tier: 2, label: "Medium Credibility", name: "Rolling Stone" },
  "nme.com": { tier: 2, label: "Medium Credibility", name: "NME" },
  "billboard.com": { tier: 2, label: "Medium Credibility", name: "Billboard" },
  "genius.com": { tier: 2, label: "Medium Credibility", name: "Genius" },
};

/**
 * Extract the registrable domain from a URL (strips subdomains like "en.").
 * Returns lowercase domain or empty string on failure.
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // Match last two segments (handles "en.wikipedia.org" → "wikipedia.org")
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return hostname;
  } catch {
    return "";
  }
}

/**
 * Get the credibility label for a URL, or null if the domain is unknown.
 */
export function getCredibilityLabel(url: string): string | null {
  const domain = extractDomain(url);
  const info = DOMAIN_CREDIBILITY[domain];
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
