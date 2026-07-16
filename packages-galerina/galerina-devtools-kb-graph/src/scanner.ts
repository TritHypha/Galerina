// =============================================================================
// scanner.ts — scans .md files in ../ZTF-Knowledge-Bases/, extracts metadata
// and cross-references between documents.
// =============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

export interface KBDocNode {
  id: string;          // filename without extension
  path: string;        // full path
  title: string;       // first # heading
  version?: string;    // "Version: X.X" line
  layer?: string;      // "Layer 0/1/2A/2B/3" from content
  status?: string;     // "Status: authoritative/draft/deprecated"
  wordCount: number;   // approximate
  lnlCodes: string[];  // all "FUNGI-XXX-NNN" codes mentioned
  lastModified: Date;  // file mtime
}

export interface KBEdge {
  from: string;        // doc id
  to: string;          // doc id
  linkText: string;    // the markdown link text
  kind: "link" | "mention";  // real [](…) hyperlink vs a prose `file.md` / "See: file.md" mention
}

export interface ScanResult {
  docs: KBDocNode[];
  edges: KBEdge[];
}

const FUNGI_CODE_RE = /FUNGI-[A-Z]+-\d+/g;
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+\.md)[^)]*\)/g;
const BACKTICK_MD_RE = /`([a-zA-Z0-9_-]+\.md)`/g;
const SEE_MD_RE = /[Ss]ee:?\s+([a-zA-Z0-9_-]+\.md)/g;
// [[doc-id]] — the KB's wiki-style cross-reference (handovers/master docs; 237 files carry them).
// Bare id, no .md. MUST be a MENTION, never a "link": a resolving [[id]] gives its target an inbound
// edge (kills the false-orphan class found 2026-07-16 — a doc referenced ONLY by wikilinks reported
// as orphaned), while a dangling [[id]] deliberately marks a doc worth writing later — house
// convention, not a broken hyperlink — so it must never enter the stale-link count.
const WIKILINK_RE = /\[\[([A-Za-z0-9._-]+)\]\]/g;
const LAYER_RE = /\bLayer\s+(0|1|2A|2B|3)\b/;
const VERSION_RE = /\*\*Version:\*\*\s*([^\s\n,]+)/;
const STATUS_RE = /\*\*Status:\*\*\s*([^\n]+)/;
const HEADING_RE = /^#\s+(.+)$/m;

function extractId(filePath: string): string {
  return basename(filePath, extname(filePath));
}

function extractEdges(fromId: string, content: string): KBEdge[] {
  const edges: KBEdge[] = [];
  const seen = new Set<string>();

  function addEdge(toFile: string, linkText: string, kind: "link" | "mention"): void {
    // Normalise to id (strip .md, strip paths)
    const toId = basename(toFile, ".md");
    if (toId === fromId) return; // skip self-links
    const key = `${fromId}→${toId}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: fromId, to: toId, linkText: linkText.trim(), kind });
  }

  // [link text](filename.md) — but SKIP external urls (http/https): a link to
  // github.com/TritHypha/Galerina/…/SECURITY.md is a CROSS-REPO reference, not an
  // internal KB doc edge, so it must never be counted as a stale internal link.
  for (const m of content.matchAll(MD_LINK_RE)) {
    const linkText = m[1] ?? "";
    const target = m[2] ?? "";
    if (target.startsWith("http://") || target.startsWith("https://")) continue;
    if (target.endsWith(".md")) addEdge(target, linkText || target, "link");
  }

  // `filename.md` — a prose/code MENTION, not a hyperlink (must not count as broken)
  for (const m of content.matchAll(BACKTICK_MD_RE)) {
    addEdge(m[1] ?? "", m[1] ?? "", "mention");
  }

  // See: filename.md — a soft MENTION, not a hyperlink
  for (const m of content.matchAll(SEE_MD_RE)) {
    addEdge(m[1] ?? "", `See: ${m[1]}`, "mention");
  }

  // [[doc-id]] — wiki-style cross-reference (see WIKILINK_RE above for the mention-not-link reasoning)
  for (const m of content.matchAll(WIKILINK_RE)) {
    addEdge(`${m[1]}.md`, `[[${m[1]}]]`, "mention");
  }

  return edges;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "build"]);

// RECURSIVE walk. A FLAT readdir silently dropped 55 docs in rd-absorbed/ +
// defensive-publications/, so every link INTO those subdirs was falsely reported
// "broken" (the target basename was never in the known-doc set). Recurse so the
// full KB corpus is indexed and cross-subdir links resolve. build/ is generated.
function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || (entry.isDirectory() && entry.name.startsWith("."))) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

export function scanKBDirectory(kbDir: string): ScanResult {
  const files = collectMarkdownFiles(kbDir).sort();

  const docs: KBDocNode[] = [];
  const edges: KBEdge[] = [];

  for (const filePath of files) {
    const id = extractId(filePath);
    let content: string;
    let stat: ReturnType<typeof statSync>;

    try {
      content = readFileSync(filePath, "utf8"); // perf-allow: loop-sync-io — one-shot KB .md dir scan, reads a different file each iteration (N = doc count)
      stat = statSync(filePath); // perf-allow: loop-sync-io — one-shot KB .md dir scan, stats a different file each iteration (N = doc count)
    } catch {
      continue;
    }

    // Title: first # heading (scrub absolute local paths — a KB doc titled with `C:\Users\<name>\...`
    // would otherwise leak the machine into the committed kb-graph report; audit-path-leak.mjs enforces this).
    const headingMatch = HEADING_RE.exec(content);
    const title = ((headingMatch?.[1] ?? "").trim() || id)
      .replace(/[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[^\s"'`)\]]+/g, "<path>")
      .replace(/(?:[A-Za-z]:[\\/]{1,2})?wwwprojects[\\/][^\s"'`)\]]*/g, "<path>");

    // Version
    const versionMatch = VERSION_RE.exec(content);
    const version = versionMatch?.[1]?.trim() ?? undefined;

    // Status
    const statusMatch = STATUS_RE.exec(content);
    const status = statusMatch?.[1]?.trim() ?? undefined;

    // Layer
    const layerMatch = LAYER_RE.exec(content);
    const layer = layerMatch?.[1] ? `Layer ${layerMatch[1]}` : undefined;

    // Word count (approximate)
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    // FUNGI codes
    const lnlCodesSet = new Set<string>();
    for (const m of content.matchAll(FUNGI_CODE_RE)) {
      lnlCodesSet.add(m[0]);
    }
    const lnlCodes = [...lnlCodesSet].sort(); // perf-allow: loop-sort — sorts this document's own FUNGI-code set, distinct per iteration (not loop-invariant)

    // Last modified
    const lastModified = stat.mtime;

    docs.push({ id, path: filePath, title, version, layer, status, wordCount, lnlCodes, lastModified });

    // Extract cross-references
    const docEdges = extractEdges(id, content);
    edges.push(...docEdges);
  }

  return { docs, edges };
}
