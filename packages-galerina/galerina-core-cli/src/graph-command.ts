import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  createDefaultProjectGraphOutputManifest,
  createWorkspaceProjectGraph,
  explainProjectGraphNode,
  findProjectGraphPath,
  queryProjectGraph,
  renderProjectGraphAiMap,
  renderProjectGraphMarkdownReport,
  type ProjectGraph,
  type ProjectGraphWorkspaceConfig,
  type ProjectGraphWorkspaceFile,
} from "../../galerina-devtools-graph-project/dist/index.js";
import type { CliContext, CliResult } from "./types.js";

interface WorkspaceConfig {
  readonly name: string;
  readonly packages: readonly string[];
  readonly docs?: Readonly<Record<string, string>>;
}

interface GraphOutputPaths {
  readonly directory: string;
  readonly jsonPath: string;
  readonly htmlPath: string;
  readonly reportPath: string;
  readonly aiMapPath: string;
}

export async function runGraphCommand(context: CliContext): Promise<CliResult> {
  const subcommand = context.args[0];

  if (subcommand === "query") {
    return runGraphQueryCommand(context);
  }

  if (subcommand === "explain") {
    return runGraphExplainCommand(context);
  }

  if (subcommand === "path") {
    return runGraphPathCommand(context);
  }

  const outputDirectory = resolveOutputDirectory(context);
  const workspacePath = join(context.cwd, "galerina.workspace.json");
  const workspace = parseWorkspaceConfig(await readFile(workspacePath, "utf8"));
  const graphWorkspace = toProjectGraphWorkspace(workspace);
  const files = await collectProjectGraphFiles(context.cwd, workspace);
  const graph = createWorkspaceProjectGraph({
    workspace: graphWorkspace,
    files,
  });
  const paths = createGraphOutputPaths(context.cwd, outputDirectory);
  const manifest = createDefaultProjectGraphOutputManifest(
    relative(context.cwd, outputDirectory).replace(/\\/g, "/"),
  );

  await mkdir(paths.directory, { recursive: true });
  await writeFile(paths.jsonPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  await writeFile(
    paths.reportPath,
    renderProjectGraphMarkdownReport(graphWorkspace, graph),
    "utf8",
  );
  await writeFile(paths.aiMapPath, renderProjectGraphAiMap(graph), "utf8");
  await writeFile(paths.htmlPath, renderProjectGraphHtml(graph), "utf8");

  return {
    ok: true,
    code: 0,
    message: "Galerina project graph generated.",
    details: [
      `Graph JSON: ${relative(context.cwd, paths.jsonPath)}`,
      `Graph report: ${relative(context.cwd, paths.reportPath)}`,
      `Graph AI map: ${relative(context.cwd, paths.aiMapPath)}`,
      `Graph HTML: ${relative(context.cwd, paths.htmlPath)}`,
      `Manifest files: ${manifest.generatedFiles.length}`,
      `Scanned files: ${files.length}`,
      `Nodes: ${graph.nodes.length}`,
      `Edges: ${graph.edges.length}`,
    ],
  };
}

async function runGraphQueryCommand(context: CliContext): Promise<CliResult> {
  const query = positionalArgs(context.args.slice(1)).join(" ").trim();
  const graph = await readGeneratedGraph(context);
  const result = queryProjectGraph(graph, { query });

  return {
    ok: true,
    code: 0,
    message: `Project graph query: ${query}`,
    details: [
      `Nodes: ${result.nodes.length}`,
      `Edges: ${result.edges.length}`,
      ...result.nodes.slice(0, 20).map((node) => `${node.id} (${node.kind})`),
    ],
  };
}

async function runGraphExplainCommand(context: CliContext): Promise<CliResult> {
  const nodeId = positionalArgs(context.args.slice(1)).join(" ").trim();
  const graph = await readGeneratedGraph(context);
  const result = explainProjectGraphNode(graph, { nodeId });

  if (result.node === undefined) {
    return {
      ok: false,
      code: 1,
      message: result.diagnostics[0]?.message ?? "Project graph node not found.",
    };
  }

  return {
    ok: true,
    code: 0,
    message: `Project graph node: ${result.node.label}`,
    details: [
      `Id: ${result.node.id}`,
      `Kind: ${result.node.kind}`,
      `Source: ${result.node.sourcePath ?? "none"}`,
      `Incoming: ${result.incoming.length}`,
      `Outgoing: ${result.outgoing.length}`,
      ...result.outgoing
        .slice(0, 15)
        .map((edge) => `${edge.kind} -> ${edge.to}`),
    ],
  };
}

async function runGraphPathCommand(context: CliContext): Promise<CliResult> {
  const args = positionalArgs(context.args.slice(1));
  const from = args[0] ?? "";
  const to = args[1] ?? "";
  const graph = await readGeneratedGraph(context);
  const result = findProjectGraphPath(graph, { from, to });

  if (!result.found) {
    return {
      ok: false,
      code: 1,
      message: result.diagnostics[0]?.message ?? "Project graph path not found.",
    };
  }

  return {
    ok: true,
    code: 0,
    message: `Project graph path: ${from} -> ${to}`,
    details: result.edges.map((edge) => `${edge.from} --${edge.kind}--> ${edge.to}`),
  };
}

async function readGeneratedGraph(context: CliContext): Promise<ProjectGraph> {
  const graphFlagIndex = context.args.findIndex((arg) => arg === "--graph");
  const graphFlagValue =
    graphFlagIndex >= 0 ? context.args[graphFlagIndex + 1] : undefined;
  const graphPath =
    graphFlagValue === undefined
      ? join(resolveOutputDirectory(context), "galerina-devtools-project-graph.json")
      : resolve(context.cwd, graphFlagValue);

  try {
    return JSON.parse(await readFile(graphPath, "utf8")) as ProjectGraph;
  } catch {
    throw new Error(
      "Project graph not found. Run `node packages-galerina\\galerina-core-cli\\dist\\index.js graph --out build\\graph` from the repository root first.",
    );
  }
}

function positionalArgs(args: readonly string[]): readonly string[] {
  const output: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--out" || arg === "--graph" || arg === "--env") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      continue;
    }
    output.push(arg);
  }

  return output;
}

function resolveOutputDirectory(context: CliContext): string {
  const outIndex = context.args.findIndex((arg) => arg === "--out");
  const outValue = outIndex >= 0 ? context.args[outIndex + 1] : undefined;
  return resolve(context.cwd, outValue ?? "build/graph");
}

function createGraphOutputPaths(
  cwd: string,
  outputDirectory: string,
): GraphOutputPaths {
  return {
    directory: outputDirectory,
    jsonPath: join(outputDirectory, "galerina-devtools-project-graph.json"),
    htmlPath: join(outputDirectory, "galerina-devtools-project-graph.html"),
    reportPath: join(outputDirectory, "Galerina_GRAPH_REPORT.md"),
    aiMapPath: join(outputDirectory, "galerina-ai-map.md"),
  };
}

function parseWorkspaceConfig(rawJson: string): WorkspaceConfig {
  const parsed: unknown = JSON.parse(rawJson);

  if (!isRecord(parsed)) {
    throw new Error("galerina.workspace.json must contain an object.");
  }

  const name = typeof parsed["name"] === "string" ? parsed["name"] : "galerina-app";
  const packages = Array.isArray(parsed["packages"])
    ? parsed["packages"].filter((value): value is string => typeof value === "string")
    : [];
  const docs = isStringMap(parsed["docs"]) ? parsed["docs"] : undefined;

  return {
    name,
    packages,
    ...(docs === undefined ? {} : { docs }),
  };
}

function toProjectGraphWorkspace(
  workspace: WorkspaceConfig,
): ProjectGraphWorkspaceConfig {
  return {
    name: workspace.name,
    packages: workspace.packages.map((path) => ({ path })),
    ...(workspace.docs === undefined ? {} : { docs: workspace.docs }),
  };
}

async function collectProjectGraphFiles(
  cwd: string,
  workspace: WorkspaceConfig,
): Promise<readonly ProjectGraphWorkspaceFile[]> {
  const roots = uniqueStrings([
    "AGENTS.md",
    "README.md",
    "galerina.workspace.json",
    "docs",
    ...workspace.packages,
  ]);
  const files: ProjectGraphWorkspaceFile[] = [];

  for (const root of roots) {
    await collectPath(cwd, root, files);
  }

  return files;
}

async function collectPath(
  cwd: string,
  path: string,
  files: ProjectGraphWorkspaceFile[],
): Promise<void> {
  const absolutePath = resolve(cwd, path);
  let pathStat;

  try {
    pathStat = await stat(absolutePath);
  } catch {
    return;
  }

  if (pathStat.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = join(path, entry.name);
      const normalizedChildPath = childPath.replace(/\\/g, "/");
      if (shouldSkipPath(normalizedChildPath)) {
        continue;
      }
      await collectPath(cwd, normalizedChildPath, files);
    }
    return;
  }

  if (!pathStat.isFile() || shouldSkipPath(path)) {
    return;
  }

  const kind = classifyGraphFile(path);
  if (kind === "other") {
    return;
  }

  files.push({
    path: path.replace(/\\/g, "/"),
    kind,
    text: await readFile(absolutePath, "utf8"),
  });
}

function classifyGraphFile(path: string): ProjectGraphWorkspaceFile["kind"] {
  const lowerPath = path.toLowerCase();

  if (lowerPath.endsWith(".md")) {
    return "markdown";
  }

  if (lowerPath.endsWith(".ts") || lowerPath.endsWith(".mts")) {
    return "typescript";
  }

  if (lowerPath.endsWith(".json")) {
    return "json";
  }

  if (lowerPath.endsWith(".spore")) {
    return "galerina-source";
  }

  return "other";
}

function shouldSkipPath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  return (
    normalizedPath.includes("/dist/") ||
    normalizedPath.includes("/.build-dev/") ||
    normalizedPath.includes("/.build-dev-") ||
    normalizedPath.includes("/node_modules/") ||
    normalizedPath.includes("/.git/") ||
    normalizedPath.endsWith(".env") ||
    normalizedPath.endsWith(".log")
  );
}

function renderProjectGraphHtml(graph: {
  readonly nodes: readonly { readonly id: string; readonly label: string; readonly kind: string }[];
  readonly edges: readonly { readonly from: string; readonly to: string; readonly kind: string }[];
}): string {
  const nodeItems = graph.nodes
    .map((node) => `<li><strong>${escapeHtml(node.label)}</strong> <span>${escapeHtml(node.kind)}</span></li>`)
    .join("\n");
  const edgeItems = graph.edges
    .slice(0, 500)
    .map(
      (edge) =>
        `<li>${escapeHtml(edge.from)} <code>${escapeHtml(edge.kind)}</code> ${escapeHtml(edge.to)}</li>`,
    )
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>Galerina Project Graph</title>",
    "<style>body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.45}code{background:#eee;padding:.1rem .25rem}span{color:#666}</style>",
    "</head>",
    "<body>",
    "<h1>Galerina Project Graph</h1>",
    `<p>${graph.nodes.length} nodes, ${graph.edges.length} relationships.</p>`,
    "<h2>Nodes</h2>",
    `<ul>${nodeItems}</ul>`,
    "<h2>Relationships</h2>",
    `<ul>${edgeItems}</ul>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringMap(value: unknown): value is Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
}
