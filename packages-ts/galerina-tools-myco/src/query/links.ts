// Broken-link detection over a markdown corpus.
//
// A flat "N broken links" count is not actionable: most breakage in a large corpus shares a
// handful of causes, and each cause has a different correct repair. So every finding is
// CLASSIFIED, and only the classes that can be resolved without guessing are repairable.
//
// The classifier deliberately REFUSES to resolve an ambiguous basename. A repairer that
// picks one of two candidate documents is right half the time, which is worse than leaving
// the link visibly broken — a wrong link that resolves is invisible.

import { posix } from "node:path";

export type LinkClass =
  | "SELF_PREFIX" // climbs out of the repo and back in by the repo's own name
  | "MOVED" // basename exists elsewhere, uniquely
  | "PLACEHOLDER" // documentation prose wearing link syntax: `file.md`, `path/to/x.md`, `...`
  | "PRIVATE_TWIN" // the target exists, but only as a `-PRIVATE` document
  | "AMBIGUOUS" // basename exists in several places — a machine must not choose
  | "MISSING"; // nothing of that name anywhere

export interface BrokenLink {
  file: string; // POSIX, relative to root
  href: string; // exactly as written
  cls: LinkClass;
  target?: string; // resolved repo-relative path, for SELF_PREFIX and MOVED only
  candidates?: string[]; // for AMBIGUOUS
}

/** Markdown inline links. Capture groups keep the surrounding syntax for in-place rewriting. */
export const MD_LINK = /(\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

interface TextRange {
  start: number;
  end: number;
}

/**
 * Return the byte-index ranges occupied by Markdown code fences and inline code spans.
 *
 * Link-shaped text inside these ranges is evidence or an example, not a live Markdown
 * link. The implementation is deliberately bounded: fence discovery is one line pass,
 * and inline backtick runs are paired through a precomputed next-equal-run table.
 */
function markdownCodeRanges(text: string): TextRange[] {
  const fences: TextRange[] = [];
  let openFence:
    | { start: number; marker: "`" | "~"; length: number }
    | undefined;

  for (let lineStart = 0; lineStart < text.length;) {
    const newline = text.indexOf("\n", lineStart);
    const lineEndWithNewline = newline < 0 ? text.length : newline + 1;
    let contentEnd = newline < 0 ? text.length : newline;
    if (contentEnd > lineStart && text[contentEnd - 1] === "\r") contentEnd--;
    const line = text.slice(lineStart, contentEnd);

    if (openFence) {
      const close = /^( {0,3})(`+|~+)[\t ]*$/.exec(line);
      if (
        close &&
        close[2]?.[0] === openFence.marker &&
        close[2].length >= openFence.length
      ) {
        fences.push({ start: openFence.start, end: lineEndWithNewline });
        openFence = undefined;
      }
    } else {
      const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      const markerRun = open?.[2];
      const info = open?.[3] ?? "";
      if (markerRun && (markerRun[0] === "~" || !info.includes("`"))) {
        openFence = {
          start: lineStart,
          marker: markerRun[0] as "`" | "~",
          length: markerRun.length,
        };
      }
    }

    lineStart = lineEndWithNewline;
  }
  if (openFence) fences.push({ start: openFence.start, end: text.length });

  const ranges = [...fences];
  let gapStart = 0;
  for (const fence of [...fences, { start: text.length, end: text.length }]) {
    const runs: Array<{ start: number; end: number; length: number }> = [];
    for (let i = gapStart; i < fence.start;) {
      if (text[i] !== "`") {
        i++;
        continue;
      }
      const start = i;
      while (i < fence.start && text[i] === "`") i++;
      runs.push({ start, end: i, length: i - start });
    }

    const nextEqual = new Array<number>(runs.length).fill(-1);
    const nextByLength = new Map<number, number>();
    for (let i = runs.length - 1; i >= 0; i--) {
      const run = runs[i];
      if (!run) continue;
      nextEqual[i] = nextByLength.get(run.length) ?? -1;
      nextByLength.set(run.length, i);
    }
    for (let i = 0; i < runs.length;) {
      const closeIndex = nextEqual[i] ?? -1;
      if (closeIndex < 0) {
        i++;
        continue;
      }
      const open = runs[i];
      const close = runs[closeIndex];
      if (open && close) ranges.push({ start: open.start, end: close.end });
      i = closeIndex + 1;
    }
    gapStart = fence.end;
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function markdownLinksOutsideCode(text: string): RegExpMatchArray[] {
  const ranges = markdownCodeRanges(text);
  const matches: RegExpMatchArray[] = [];
  let rangeIndex = 0;
  for (const match of text.matchAll(MD_LINK)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    while (ranges[rangeIndex] && ranges[rangeIndex]!.end <= start) rangeIndex++;
    const range = ranges[rangeIndex];
    // Inline code is legal inside a Markdown link label (for example,
    // [`type`](types.md)); only suppress a match when its opening `[` is inside code.
    if (range && range.start <= start && start < range.end) continue;
    matches.push(match);
  }
  return matches;
}

/**
 * Hrefs that are documentation ABOUT links rather than links. `[see](file.md)` in a template
 * is prose; treating it as breakage buries the real findings under boilerplate.
 *
 * Two patterns, because two shapes: some placeholders are recognisable from the basename
 * alone (`file.md`), others only from the whole path (`path/to/thing.md`) — and a basename
 * test can never see the second kind.
 */
const PLACEHOLDER_BASENAME_RE =
  /^(file|example|template|your-[^/]*|some-[^/]*|<[^>]+>|name|foo|bar|xxx)\.(md|txt|json)$/i;
const PLACEHOLDER_PATH_RE = /^(path\/to\/|your-path\/|<[^>]+>\/)/i;
/**
 * Elided prose that markdown's link syntax swallowed: `[…](...)`, `../../...`, `...a`.
 * An ellipsis is an author saying "and so on", never a path. Left as a link it is
 * indistinguishable from real rot, and it is not repairable because it never had a target.
 */
const ELLIPSIS_RE = /(^|\/)\.{3,}[a-z0-9]*$/i;

/** Schemes and shapes that are not repo-relative links and are never "broken" here. */
export function isExternalHref(href: string): boolean {
  return (
    /^(https?:|mailto:|data:|ftp:|#)/i.test(href) ||
    /^file:/i.test(href) ||
    /^[a-zA-Z]:[\\/]/.test(href) ||
    href.startsWith("/")
  );
}

/**
 * Classify one broken href.
 *   fileDir   POSIX dir of the containing file, relative to root ("" at the root)
 *   nameIndex basename -> every repo-relative path carrying that basename
 *   repoName  the root directory's own name, for SELF_PREFIX detection
 */
export function classifyBroken(
  href: string,
  fileDir: string,
  nameIndex: Map<string, string[]>,
  repoName: string,
): { cls: LinkClass; target?: string; candidates?: string[] } {
  const raw = decodeURIComponent(href.split("#")[0] ?? "");
  const base = raw.split("/").pop() ?? "";

  if (PLACEHOLDER_BASENAME_RE.test(base) || PLACEHOLDER_PATH_RE.test(raw) || ELLIPSIS_RE.test(raw)) {
    return { cls: "PLACEHOLDER" };
  }

  // `../../<repoName>/inner/path.md` — a link that leaves the repo only to re-enter it.
  // Common after a restructure, and always expressible as a plain relative path.
  const selfRe = new RegExp(`^(?:\\.\\./)+${escapeRe(repoName)}/(.+)$`);
  const m = selfRe.exec(raw);
  if (m) {
    const inner = m[1] ?? "";
    const innerBase = inner.split("/").pop() ?? "";
    const cands = nameIndex.get(innerBase);
    if (cands && cands.length > 0) {
      if (cands.includes(inner)) return { cls: "SELF_PREFIX", target: inner };
      if (cands.length === 1) return { cls: "SELF_PREFIX", target: cands[0] };
      return { cls: "AMBIGUOUS", candidates: cands };
    }
    return { cls: "MISSING" };
  }

  // A link that CARRIES A PATH says where the file was meant to be. If it is not there, that
  // is a missing target, not a naming ambiguity — and matching the basename tree-wide would
  // "find" it in unrelated directories. `README.md` is the commonest basename in any
  // repository, so an external `bench/README.md` otherwise reports 27 candidates and buries
  // the real signal. Ambiguity is only meaningful for a BARE filename.
  const hasPath = raw.includes("/");
  const cands = nameIndex.get(base);
  if (hasPath && (!cands || cands.length !== 1)) {
    const twinPathed = nameIndex.get(base.replace(/\.md$/i, "-PRIVATE.md"));
    if (twinPathed && twinPathed.length === 1) return { cls: "PRIVATE_TWIN", candidates: twinPathed };
    return { cls: "MISSING" };
  }
  if (!cands || cands.length === 0) {
    // The document may exist only as its never-public twin. That is NOT auto-repairable:
    // repointing a public document at a `-PRIVATE` one is a publication-scope decision, and
    // a human makes it. Surfacing it is the useful half.
    const twin = nameIndex.get(base.replace(/\.md$/i, "-PRIVATE.md"));
    if (twin && twin.length > 0) return { cls: "PRIVATE_TWIN", candidates: twin };
    return { cls: "MISSING" };
  }
  if (cands.length > 1) return { cls: "AMBIGUOUS", candidates: cands };
  return { cls: "MOVED", target: cands[0] };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `a/b/` -> `a/b`. Leaves a lone `/` and the empty string alone. */
export function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/** A never-public document: tagged in the filename, or living under a `private/` tree. */
export function isPrivatePath(p: string): boolean {
  return /-PRIVATE\.[A-Za-z0-9]+$/.test(p) || /(^|\/)private\//.test(p);
}

/**
 * A RESOLVED link from a public document into a never-public one. Not broken — which is
 * exactly why it needs its own report: it works today, and it is a publication-scope leak
 * the moment the public document is mirrored anywhere. Broken-link checking would never
 * surface it, because nothing is broken.
 */
export interface PrivateRef {
  file: string;
  href: string;
  target: string;
}

export function scanPrivateRefs(
  relFile: string,
  text: string,
  exists: (p: string) => boolean,
): PrivateRef[] {
  if (isPrivatePath(relFile)) return []; // private-to-private is in scope by definition
  const dir = posix.dirname(relFile) === "." ? "" : posix.dirname(relFile);
  const out: PrivateRef[] = [];
  for (const m of markdownLinksOutsideCode(text)) {
    const href = m[2] ?? "";
    if (isExternalHref(href)) continue;
    const rawPath = href.split("#")[0] ?? "";
    if (rawPath === "") continue;
    const target = stripTrailingSlash(
      posix.normalize(posix.join(dir, decodeURIComponent(rawPath))),
    );
    if (!exists(target)) continue; // a broken link is the other report's business
    if (isPrivatePath(target)) out.push({ file: relFile, href, target });
  }
  return out;
}

/**
 * Scan one file's text for broken links.
 *   exists(relPath) must answer whether a repo-relative path is present.
 */
export function scanText(
  relFile: string,
  text: string,
  exists: (p: string) => boolean,
  nameIndex: Map<string, string[]>,
  repoName: string,
): BrokenLink[] {
  const dir = posix.dirname(relFile) === "." ? "" : posix.dirname(relFile);
  const out: BrokenLink[] = [];
  for (const m of markdownLinksOutsideCode(text)) {
    const href = m[2] ?? "";
    if (isExternalHref(href)) continue;
    const rawPath = href.split("#")[0] ?? "";
    if (rawPath === "") continue;
    // A directory link keeps its trailing slash through normalize(), so `research/rd/`
    // would never match a `research/rd` entry. Strip it before the lookup — otherwise every
    // link to a directory reads as missing.
    const target = stripTrailingSlash(posix.normalize(posix.join(dir, decodeURIComponent(rawPath))));
    if (target === "" || target === "." || exists(target)) continue;
    out.push({ file: relFile, href, ...classifyBroken(href, dir, nameIndex, repoName) });
  }
  return out;
}

/** Rewrite the repairable classes in one file's text. Returns the new text and a count. */
export function repairText(
  relFile: string,
  text: string,
  findings: BrokenLink[],
  delinkMissing = false,
): { text: string; repaired: number; delinked: number } {
  const dir = posix.dirname(relFile) === "." ? "" : posix.dirname(relFile);
  let repaired = 0;
  let delinked = 0;
  const parts: string[] = [];
  let cursor = 0;
  for (const match of markdownLinksOutsideCode(text)) {
    const whole = match[0];
    const open = match[1] ?? "";
    const href = match[2] ?? "";
    const close = match[3] ?? "";
    const start = match.index ?? 0;
    parts.push(text.slice(cursor, start));
    const f = findings.find((x) => x.href === href);
    let replacement = whole;
    // De-linking preserves the path as text while removing the false promise that it is
    // navigable. Applied to PLACEHOLDER always, and to MISSING only when explicitly asked:
    // for an absorbed document whose links point into a repository that is not checked out
    // here, the path IS the provenance and must survive.
    if (f && (f.cls === "PLACEHOLDER" || (delinkMissing && f.cls === "MISSING"))) {
      const label = open.slice(1, -2);
      delinked++;
      replacement = label && label !== href ? `${label} (\`${href}\`)` : `\`${href}\``;
    } else if (
      f &&
      (f.cls === "SELF_PREFIX" || f.cls === "MOVED") &&
      f.target !== undefined
    ) {
      let rel = posix.relative(dir === "" ? "." : dir, f.target);
      if (rel !== "") {
        if (!rel.startsWith(".")) rel = "./" + rel;
        const hashAt = href.indexOf("#");
        const anchor = hashAt >= 0 ? href.slice(hashAt) : "";
        repaired++;
        replacement = open + rel + anchor + close;
      }
    }
    parts.push(replacement);
    cursor = start + whole.length;
  }
  parts.push(text.slice(cursor));
  return { text: parts.join(""), repaired, delinked };
}
