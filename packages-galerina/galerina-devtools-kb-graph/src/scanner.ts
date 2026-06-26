// =============================================================================
// scanner.ts — scans .md files in docs/Knowledge-Bases/, extracts metadata
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
  lnlCodes: string[];  // all "SPORE-XXX-NNN" codes mentioned
  lastModified: Date;  // file mtime
}

export interface KBEdge {
  from: string;        // doc id
  to: string;          // doc id
  linkText: string;    // the markdown link text
}

export interface ScanResult {
  docs: KBDocNode[];
  edges: KBEdge[];
}

const SPORE_CODE_RE = /SPORE-[A-Z]+-\d+/g;
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+\.md)[^)]*\)/g;
const BACKTICK_MD_RE = /`([a-zA-Z0-9_-]+\.md)`/g;
const SEE_MD_RE = /[Ss]ee:?\s+([a-zA-Z0-9_-]+\.md)/g;
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

  function addEdge(toFile: string, linkText: string): void {
    // Normalise to id (strip .md, strip paths)
    const toId = basename(toFile, ".md");
    if (toId === fromId) return; // skip self-links
    const key = `${fromId}→${toId}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: fromId, to: toId, linkText: linkText.trim() });
  }

  // [link text](filename.md)
  for (const m of content.matchAll(MD_LINK_RE)) {
    const linkText = m[1] ?? "";
    const target = m[2] ?? "";
    if (target.endsWith(".md")) addEdge(target, linkText || target);
  }

  // `filename.md`
  for (const m of content.matchAll(BACKTICK_MD_RE)) {
    addEdge(m[1] ?? "", m[1] ?? "");
  }

  // See: filename.md
  for (const m of content.matchAll(SEE_MD_RE)) {
    addEdge(m[1] ?? "", `See: ${m[1]}`);
  }

  return edges;
}

export function scanKBDirectory(kbDir: string): ScanResult {
  const files = readdirSync(kbDir)
    .filter(f => f.endsWith(".md"))
    .sort();

  const docs: KBDocNode[] = [];
  const edges: KBEdge[] = [];

  for (const file of files) {
    const filePath = join(kbDir, file);
    const id = extractId(file);
    let content: string;
    let stat: ReturnType<typeof statSync>;

    try {
      content = readFileSync(filePath, "utf8");
      stat = statSync(filePath);
    } catch {
      continue;
    }

    // Title: first # heading
    const headingMatch = HEADING_RE.exec(content);
    const title = (headingMatch?.[1] ?? "").trim() || id;

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

    // SPORE codes
    const lnlCodesSet = new Set<string>();
    for (const m of content.matchAll(SPORE_CODE_RE)) {
      lnlCodesSet.add(m[0]);
    }
    const lnlCodes = [...lnlCodesSet].sort();

    // Last modified
    const lastModified = stat.mtime;

    docs.push({ id, path: filePath, title, version, layer, status, wordCount, lnlCodes, lastModified });

    // Extract cross-references
    const docEdges = extractEdges(id, content);
    edges.push(...docEdges);
  }

  return { docs, edges };
}
