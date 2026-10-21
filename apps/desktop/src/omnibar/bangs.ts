/**
 * DuckDuckGo-style bangs in the OmniBar (FEAT-004): `!yt cats` or `cats !yt`
 * searches that site. About 60 are built in; your own override them; any
 * other bang goes to DuckDuckGo, which knows over 13,000. Pure functions.
 */
import type { Bang } from "@mousecomb/data";

type Builtin = { name: string; url: string };

const b = (name: string, url: string): Builtin => ({ name, url });

/** Trigger → site. `{q}` is the search words, URL-encoded. */
export const BUILTIN_BANGS: Readonly<Record<string, Builtin>> = {
  g: b("Google", "https://www.google.com/search?q={q}"),
  gi: b("Google Images", "https://www.google.com/search?tbm=isch&q={q}"),
  gn: b("Google News", "https://news.google.com/search?q={q}"),
  gm: b("Google Maps", "https://www.google.com/maps/search/{q}"),
  maps: b("Google Maps", "https://www.google.com/maps/search/{q}"),
  gs: b("Google Scholar", "https://scholar.google.com/scholar?q={q}"),
  gt: b("Google Translate", "https://translate.google.com/?sl=auto&tl=en&text={q}"),
  tr: b("Google Translate", "https://translate.google.com/?sl=auto&tl=en&text={q}"),
  b: b("Bing", "https://www.bing.com/search?q={q}"),
  yt: b("YouTube", "https://www.youtube.com/results?search_query={q}"),
  ytm: b("YouTube Music", "https://music.youtube.com/search?q={q}"),
  sp: b("Spotify", "https://open.spotify.com/search/{q}"),
  w: b("Wikipedia", "https://en.wikipedia.org/wiki/Special:Search?search={q}"),
  wt: b("Wiktionary", "https://en.wiktionary.org/wiki/Special:Search?search={q}"),
  wa: b("Wolfram Alpha", "https://www.wolframalpha.com/input?i={q}"),
  dict: b("Merriam-Webster", "https://www.merriam-webster.com/dictionary/{q}"),
  ud: b("Urban Dictionary", "https://www.urbandictionary.com/define.php?term={q}"),
  gh: b("GitHub", "https://github.com/search?q={q}"),
  gl: b("GitLab", "https://gitlab.com/search?search={q}"),
  so: b("Stack Overflow", "https://stackoverflow.com/search?q={q}"),
  se: b("Stack Exchange", "https://stackexchange.com/search?q={q}"),
  npm: b("npm", "https://www.npmjs.com/search?q={q}"),
  crates: b("crates.io", "https://crates.io/search?q={q}"),
  pypi: b("PyPI", "https://pypi.org/search/?q={q}"),
  go: b("Go packages", "https://pkg.go.dev/search?q={q}"),
  dh: b("Docker Hub", "https://hub.docker.com/search?q={q}"),
  mdn: b("MDN", "https://developer.mozilla.org/en-US/search?q={q}"),
  ms: b("Microsoft Learn", "https://learn.microsoft.com/en-us/search/?terms={q}"),
  hf: b("Hugging Face", "https://huggingface.co/models?search={q}"),
  arxiv: b("arXiv", "https://arxiv.org/search/?query={q}"),
  hn: b("Hacker News", "https://hn.algolia.com/?q={q}"),
  r: b("Reddit", "https://www.reddit.com/search/?q={q}"),
  x: b("X", "https://x.com/search?q={q}"),
  tw: b("X", "https://x.com/search?q={q}"),
  li: b("LinkedIn", "https://www.linkedin.com/search/results/all/?keywords={q}"),
  fb: b("Facebook", "https://www.facebook.com/search/top?q={q}"),
  ig: b("Instagram", "https://www.instagram.com/explore/search/keyword/?q={q}"),
  pin: b("Pinterest", "https://www.pinterest.com/search/pins/?q={q}"),
  med: b("Medium", "https://medium.com/search?q={q}"),
  quora: b("Quora", "https://www.quora.com/search?q={q}"),
  twitch: b("Twitch", "https://www.twitch.tv/search?term={q}"),
  imdb: b("IMDb", "https://www.imdb.com/find/?q={q}"),
  rt: b("Rotten Tomatoes", "https://www.rottentomatoes.com/search?search={q}"),
  a: b("Amazon", "https://www.amazon.com/s?k={q}"),
  amazon: b("Amazon", "https://www.amazon.com/s?k={q}"),
  ebay: b("eBay", "https://www.ebay.com/sch/i.html?_nkw={q}"),
  ali: b("AliExpress", "https://www.aliexpress.com/wholesale?SearchText={q}"),
  daraz: b("Daraz", "https://www.daraz.pk/catalog/?q={q}"),
  olx: b("OLX", "https://www.olx.com.pk/items/q-{q}"),
  yelp: b("Yelp", "https://www.yelp.com/search?find_desc={q}"),
  tripadvisor: b("Tripadvisor", "https://www.tripadvisor.com/Search?q={q}"),
  gf: b("Google Flights", "https://www.google.com/travel/flights?q={q}"),
  gd: b("Google Drive", "https://drive.google.com/drive/search?q={q}"),
  gmail: b("Gmail", "https://mail.google.com/mail/u/0/#search/{q}"),
  cal: b("Google Calendar", "https://calendar.google.com/calendar/u/0/r/search?q={q}"),
  notion: b("Notion", "https://www.notion.so/search?q={q}"),
  figma: b("Figma", "https://www.figma.com/files/search?q={q}"),
  cppref: b("cppreference", "https://en.cppreference.com/mwiki/index.php?search={q}"),
  rust: b("Rust docs", "https://doc.rust-lang.org/std/?search={q}"),
  docsrs: b("docs.rs", "https://docs.rs/releases/search?query={q}"),
  aur: b("Arch AUR", "https://aur.archlinux.org/packages?K={q}"),
  ddg: b("DuckDuckGo", "https://duckduckgo.com/?q={q}"),
};

export type BangMatch = {
  trigger: string;
  /** The words to search for (the bang removed). */
  terms: string;
  /** Where the bang goes; `fallback` means DuckDuckGo resolves it. */
  site: { name: string; url: string; fallback: boolean };
};

/** Pull a `!bang` out of the text: at the start, the end or in the middle, as its own word. */
export function parseBang(query: string): { trigger: string; terms: string } | null {
  const m = /(^|\s)!([a-z0-9]{1,16})(?=\s|$)/i.exec(query);
  if (!m) return null;
  const terms = (query.slice(0, m.index) + " " + query.slice(m.index + m[0].length)).trim().replace(/\s+/g, " ");
  return { trigger: m[2]!.toLowerCase(), terms };
}

/** Which site a bang means: yours first, then the built-in list, otherwise DuckDuckGo. */
export function resolveBang(query: string, mine: readonly Bang[]): BangMatch | null {
  const parsed = parseBang(query);
  if (!parsed) return null;
  const { trigger, terms } = parsed;
  const own = mine.find((x) => x.trigger === trigger);
  if (own) return { trigger, terms, site: { name: own.name, url: own.url, fallback: false } };
  const builtin = BUILTIN_BANGS[trigger];
  if (builtin) return { trigger, terms, site: { ...builtin, fallback: false } };
  return {
    trigger,
    terms,
    site: { name: `DuckDuckGo !${trigger}`, url: `https://duckduckgo.com/?q=${encodeURIComponent(`!${trigger}`)}+{q}`, fallback: true },
  };
}

/** The address to open: with no words, the site's front page. */
export function bangUrl(match: BangMatch): string {
  const { url, fallback } = match.site;
  if (match.terms) return url.replace("{q}", encodeURIComponent(match.terms));
  if (fallback) return `https://duckduckgo.com/?q=${encodeURIComponent(`!${match.trigger}`)}`;
  return new URL(url.replace("{q}", "")).origin;
}
