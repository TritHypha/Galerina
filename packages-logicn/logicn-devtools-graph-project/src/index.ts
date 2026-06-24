import { GraphBuilder, bfsPath as llnBfsPath } from "@logicn/devtools-project-graph";

export type ProjectGraphNodeKind =
  | "Package"
  | "Document"
  | "Flow"
  | "Type"
  | "Effect"
  | "Policy"
  | "UnsafeFeature"
  | "Report"
  | "Target"
  | "CompilerRule"
  | "RuntimeRule"
  | "SecurityRule"
  | "ComputeFeature"
  | "Decision"
  // ── Governance Architecture (Phase 25+) ─────────────────────────────────
  /** A flow-level governance proof and compliance certificate. */
  | "ProofGraph"
  /** Per-flow governance rules, flags, and mandate bitmask. */
  | "GovernanceGraph"
  /** Economic routing evaluation: expected_cost = compute + breach_probability × breach_loss. */
  | "CostGraph"
  /** Risk-adjusted value classification: safety_critical / mission_critical / etc. */
  | "ValueGraph"
  /** Hardware dispatch plan: CPU / GPU / NPU / APU / WASM targeting. */
  | "ExecutionGraph"
  /** Diagnostic code definition: LLN-* series. */
  | "DiagnosticCode"
  /** Runtime profile definition: strict / high_integrity / deterministic. */
  | "RuntimeProfile"
  /** Hardware capability: P-core / E-core / AVX2 / AVX-512 / WASM SIMD. */
  | "HardwareCapability"
  /** Economic constraint or budget rule inside contract.economics. */
  | "EconomicConstraint"
  /** Safety classification requirement inside contract.safety. */
  | "SafetyConstraint"
  /** Governance marketplace entry: reusable governance shape. */
  | "GovernanceShape";

export type ProjectGraphEdgeKind =
  | "owns"
  | "provides"
  | "uses"
  | "checked_by"
  | "enforced_by"
  | "documents"
  | "generates"
  | "fallback_for"
  | "maps_to"
  | "classified_as"
  | "depends_on"
  | "explains"
  // ── Governance Architecture edges ───────────────────────────────────────
  /** A layer verifies another before it can proceed. */
  | "verifies_before"
  /** A component routes execution to a target based on rules. */
  | "routes_to"
  /** A graph is a projection/view of another (GovernanceGraph → CostGraph). */
  | "projects_from"
  /** A flow produces a proof graph as evidence of compliance. */
  | "produces_proof"
  /** An economic constraint operates within a governance boundary. */
  | "constrained_by"
  /** A hardware capability accelerates a computation target. */
  | "accelerated_by"
  /** A profile restricts a language feature or runtime behaviour. */
  | "restricts";

export type ProjectGraphConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export type ProjectGraphDiagnosticSeverity = "warning" | "error";

export type ProjectGraphBackendId =
  | "LogicN_native"
  | "graphify"
  | "static_analyser"
  | "docs_indexer"
  | "future_standard"
  | "plan_only";

export type ProjectGraphBackendSourceKind =
  | "built-in"
  | "git"
  | "local-package"
  | "npm"
  | "external-command"
  | "plan-only";

export type ProjectGraphBackendCapability =
  | "workspace-metadata"
  | "static-analysis"
  | "semantic-extraction"
  | "json-output"
  | "html-output"
  | "report-output"
  | "media-extraction"
  | "model-assisted-extraction";

export interface ProjectGraphDiagnostic {
  readonly code: string;
  readonly severity: ProjectGraphDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface ProjectGraphNode {
  readonly id: string;
  readonly kind: ProjectGraphNodeKind;
  readonly label: string;
  readonly sourcePath?: string;
  readonly summary?: string;
  readonly tags: readonly string[];
}

export interface ProjectGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: ProjectGraphEdgeKind;
  readonly confidence: ProjectGraphConfidence;
  readonly evidencePath?: string;
  readonly rationale?: string;
}

export interface ProjectGraph {
  readonly version: string;
  readonly generatedAt: string;
  readonly nodes: readonly ProjectGraphNode[];
  readonly edges: readonly ProjectGraphEdge[];
}

export interface ProjectGraphWorkspacePackage {
  readonly path: string;
  readonly name?: string;
  readonly role?: string;
}

export interface ProjectGraphWorkspaceConfig {
  readonly name: string;
  readonly packages: readonly ProjectGraphWorkspacePackage[];
  readonly docs?: Readonly<Record<string, string>>;
}

export type ProjectGraphScanSource =
  | "markdown"
  | "logicn-source"
  | "typescript"
  | "json-report"
  | "schema"
  | "diagram"
  | "pdf"
  | "image"
  | "video";

export interface ProjectGraphScanPolicy {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly sources: readonly ProjectGraphScanSource[];
  readonly allowModelExtraction: boolean;
  readonly redactSecrets: boolean;
  readonly commitGeneratedGraph: boolean;
}

export interface ProjectGraphBackendPolicy {
  readonly preferred: readonly ProjectGraphBackendId[];
  readonly allowGitBackends: boolean;
  readonly requirePinnedGitRef: boolean;
  readonly allowModelExtractionBackends: boolean;
}

export interface ProjectGraphBackendReference {
  readonly id: ProjectGraphBackendId;
  readonly label: string;
  readonly source: ProjectGraphBackendSourceKind;
  readonly packageName?: string;
  readonly gitUrl?: string;
  readonly gitRef?: string;
  readonly command?: string;
  readonly version?: string;
  readonly capabilities: readonly ProjectGraphBackendCapability[];
}

export interface ProjectGraphBackendSelection {
  readonly requested: ProjectGraphBackendId | "auto";
  readonly selected: ProjectGraphBackendId;
  readonly source: ProjectGraphBackendSourceKind;
  readonly fallback: boolean;
  readonly reason: string;
}

export interface ProjectGraphOutputManifest {
  readonly jsonPath: string;
  readonly htmlPath?: string;
  readonly reportPath: string;
  readonly aiMapPath: string;
  readonly generatedFiles: readonly string[];
}

export interface ProjectGraphBuildPlan {
  readonly root: string;
  readonly policy: ProjectGraphScanPolicy;
  readonly backendPolicy?: ProjectGraphBackendPolicy;
  readonly backend?: ProjectGraphBackendSelection;
  readonly output: ProjectGraphOutputManifest;
}

export type ProjectGraphFileKind =
  | "markdown"
  | "typescript"
  | "json"
  | "logicn-source"
  | "other";

export interface ProjectGraphWorkspaceFile {
  readonly path: string;
  readonly kind: ProjectGraphFileKind;
  readonly text: string;
}

export interface WorkspaceProjectGraphBuildInput {
  readonly workspace: ProjectGraphWorkspaceConfig;
  readonly files: readonly ProjectGraphWorkspaceFile[];
  readonly generatedAt?: string;
}

export interface ProjectGraphQueryRequest {
  readonly query: string;
  readonly graphPath?: string;
}

export interface ProjectGraphPathRequest {
  readonly from: string;
  readonly to: string;
  readonly graphPath?: string;
}

export interface ProjectGraphExplainRequest {
  readonly nodeId: string;
  readonly graphPath?: string;
}

export interface ProjectGraphQueryResult {
  readonly query: string;
  readonly nodes: readonly ProjectGraphNode[];
  readonly edges: readonly ProjectGraphEdge[];
}

export interface ProjectGraphPathResult {
  readonly from: string;
  readonly to: string;
  readonly found: boolean;
  readonly nodes: readonly ProjectGraphNode[];
  readonly edges: readonly ProjectGraphEdge[];
  readonly diagnostics: readonly ProjectGraphDiagnostic[];
}

export interface ProjectGraphExplainResult {
  readonly nodeId: string;
  readonly node?: ProjectGraphNode;
  readonly incoming: readonly ProjectGraphEdge[];
  readonly outgoing: readonly ProjectGraphEdge[];
  readonly relatedNodes: readonly ProjectGraphNode[];
  readonly diagnostics: readonly ProjectGraphDiagnostic[];
}

export interface ProjectGraphReport {
  readonly graph: ProjectGraph;
  readonly manifest: ProjectGraphOutputManifest;
  readonly backend?: ProjectGraphBackendSelection;
  readonly diagnostics: readonly ProjectGraphDiagnostic[];
  readonly warnings: readonly string[];
}

export const DEFAULT_PROJECT_GRAPH_SCAN_POLICY: ProjectGraphScanPolicy = {
  include: ["README.md", "docs/**", "packages/**", "packages-logicn/**"],
  exclude: ["**/dist/**", "**/.build-dev/**", "**/.build-dev-*/*", "**/node_modules/**", "**/.env", "**/*.log"],
  sources: ["markdown", "logicn-source", "typescript", "json-report", "schema"],
  allowModelExtraction: false,
  redactSecrets: true,
  commitGeneratedGraph: false,
};

export const DEFAULT_PROJECT_GRAPH_BACKEND_POLICY: ProjectGraphBackendPolicy = {
  preferred: ["LogicN_native", "graphify", "future_standard"],
  allowGitBackends: false,
  requirePinnedGitRef: true,
  allowModelExtractionBackends: false,
};

export function defineProjectGraphScanPolicy(
  policy: Partial<ProjectGraphScanPolicy> = {},
): ProjectGraphScanPolicy {
  return {
    include: policy.include ?? DEFAULT_PROJECT_GRAPH_SCAN_POLICY.include,
    exclude: policy.exclude ?? DEFAULT_PROJECT_GRAPH_SCAN_POLICY.exclude,
    sources: policy.sources ?? DEFAULT_PROJECT_GRAPH_SCAN_POLICY.sources,
    allowModelExtraction:
      policy.allowModelExtraction ??
      DEFAULT_PROJECT_GRAPH_SCAN_POLICY.allowModelExtraction,
    redactSecrets:
      policy.redactSecrets ?? DEFAULT_PROJECT_GRAPH_SCAN_POLICY.redactSecrets,
    commitGeneratedGraph:
      policy.commitGeneratedGraph ??
      DEFAULT_PROJECT_GRAPH_SCAN_POLICY.commitGeneratedGraph,
  };
}

export function defineProjectGraphBackendPolicy(
  policy: Partial<ProjectGraphBackendPolicy> = {},
): ProjectGraphBackendPolicy {
  return {
    preferred: policy.preferred ?? DEFAULT_PROJECT_GRAPH_BACKEND_POLICY.preferred,
    allowGitBackends:
      policy.allowGitBackends ??
      DEFAULT_PROJECT_GRAPH_BACKEND_POLICY.allowGitBackends,
    requirePinnedGitRef:
      policy.requirePinnedGitRef ??
      DEFAULT_PROJECT_GRAPH_BACKEND_POLICY.requirePinnedGitRef,
    allowModelExtractionBackends:
      policy.allowModelExtractionBackends ??
      DEFAULT_PROJECT_GRAPH_BACKEND_POLICY.allowModelExtractionBackends,
  };
}

export function selectProjectGraphBackend(
  adapters: readonly ProjectGraphBackendReference[],
  policy: ProjectGraphBackendPolicy = DEFAULT_PROJECT_GRAPH_BACKEND_POLICY,
  requested: ProjectGraphBackendId | "auto" = "auto",
): ProjectGraphBackendSelection {
  const preference =
    requested === "auto" ? policy.preferred : [requested, ...policy.preferred];

  for (const backendId of preference) {
    const adapter = adapters.find((item) => item.id === backendId);

    if (adapter !== undefined) {
      return {
        requested,
        selected: adapter.id,
        source: adapter.source,
        fallback: requested !== "auto" && adapter.id !== requested,
        reason: "Project graph backend is available in preference order.",
      };
    }
  }

  return {
    requested,
    selected: "plan_only",
    source: "plan-only",
    fallback: true,
    reason: "No requested project graph backend is available.",
  };
}

export function validateProjectGraphBackendReference(
  backend: ProjectGraphBackendReference,
  policy: ProjectGraphBackendPolicy = DEFAULT_PROJECT_GRAPH_BACKEND_POLICY,
): readonly ProjectGraphDiagnostic[] {
  const diagnostics: ProjectGraphDiagnostic[] = [];

  if (backend.label.trim().length === 0) {
    diagnostics.push({
      code: "LogicN_PROJECT_GRAPH_BACKEND_LABEL_REQUIRED",
      severity: "error",
      message: "Project graph backend requires a label.",
      path: "backend.label",
    });
  }

  if (backend.source === "git" && !policy.allowGitBackends) {
    diagnostics.push({
      code: "LogicN_PROJECT_GRAPH_GIT_BACKEND_NOT_ALLOWED",
      severity: "error",
      message:
        "Git project graph backends must be explicitly allowed by backend policy.",
      path: "backend.source",
    });
  }

  if (
    backend.source === "git" &&
    policy.requirePinnedGitRef &&
    (backend.gitRef === undefined || backend.gitRef.trim().length === 0)
  ) {
    diagnostics.push({
      code: "LogicN_PROJECT_GRAPH_GIT_BACKEND_REF_REQUIRED",
      severity: "error",
      message: "Git project graph backends require a pinned git ref.",
      path: "backend.gitRef",
    });
  }

  if (
    backend.capabilities.includes("model-assisted-extraction") &&
    !policy.allowModelExtractionBackends
  ) {
    diagnostics.push({
      code: "LogicN_PROJECT_GRAPH_MODEL_BACKEND_NOT_ALLOWED",
      severity: "error",
      message:
        "Model-assisted project graph backends must be explicitly allowed by backend policy.",
      path: "backend.capabilities",
    });
  }

  return diagnostics;
}

export function createProjectGraphReport(
  graph: ProjectGraph,
  manifest: ProjectGraphOutputManifest,
  backend?: ProjectGraphBackendSelection,
): ProjectGraphReport {
  const diagnostics = validateProjectGraph(graph);

  return {
    graph,
    manifest,
    ...(backend === undefined ? {} : { backend }),
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

export function queryProjectGraph(
  graph: ProjectGraph,
  request: ProjectGraphQueryRequest,
): ProjectGraphQueryResult {
  const query = normalizeQuery(request.query);

  if (query.length === 0) {
    return {
      query: request.query,
      nodes: [],
      edges: [],
    };
  }

  const nodes = graph.nodes.filter((node) => nodeMatchesQuery(node, query));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) =>
      edgeMatchesQuery(edge, query) || nodeIds.has(edge.from) || nodeIds.has(edge.to),
  );

  return {
    query: request.query,
    nodes,
    edges,
  };
}

export function explainProjectGraphNode(
  graph: ProjectGraph,
  request: ProjectGraphExplainRequest,
): ProjectGraphExplainResult {
  const node = findGraphNode(graph, request.nodeId);

  if (node === undefined) {
    return {
      nodeId: request.nodeId,
      incoming: [],
      outgoing: [],
      relatedNodes: [],
      diagnostics: [
        {
          code: "LogicN_PROJECT_GRAPH_EXPLAIN_NODE_MISSING",
          severity: "error",
          message: `Project graph node "${request.nodeId}" was not found.`,
          path: "nodeId",
        },
      ],
    };
  }

  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const relatedNodeIds = new Set([
    ...incoming.map((edge) => edge.from),
    ...outgoing.map((edge) => edge.to),
  ]);

  return {
    nodeId: request.nodeId,
    node,
    incoming,
    outgoing,
    relatedNodes: graph.nodes.filter((candidate) => relatedNodeIds.has(candidate.id)),
    diagnostics: [],
  };
}

export function findProjectGraphPath(
  graph: ProjectGraph,
  request: ProjectGraphPathRequest,
): ProjectGraphPathResult {
  const from = findGraphNode(graph, request.from);
  const to = findGraphNode(graph, request.to);

  if (from === undefined || to === undefined) {
    return {
      from: request.from,
      to: request.to,
      found: false,
      nodes: [],
      edges: [],
      diagnostics: [
        ...(from === undefined
          ? [
              {
                code: "LogicN_PROJECT_GRAPH_PATH_FROM_MISSING",
                severity: "error" as const,
                message: `Project graph path source "${request.from}" was not found.`,
                path: "from",
              },
            ]
          : []),
        ...(to === undefined
          ? [
              {
                code: "LogicN_PROJECT_GRAPH_PATH_TO_MISSING",
                severity: "error" as const,
                message: `Project graph path target "${request.to}" was not found.`,
                path: "to",
              },
            ]
          : []),
      ],
    };
  }

  // Build a transient lln-graph for the BFS, keyed by node id.
  const llnBuilder = new GraphBuilder<ProjectGraphNode, ProjectGraphEdge>();
  for (const node of graph.nodes) llnBuilder.addNode(node.id, node);
  for (const edge of graph.edges) {
    try { llnBuilder.addEdge(edge.from, edge.to, edge); } catch { /* skip edges to unknown nodes */ }
  }
  const llnGraph = llnBuilder.build();

  const pathIds = llnBfsPath(llnGraph, from.id, to.id);

  if (pathIds === null) {
    return {
      from: request.from,
      to: request.to,
      found: false,
      nodes: [],
      edges: [],
      diagnostics: [
        {
          code: "LogicN_PROJECT_GRAPH_PATH_NOT_FOUND",
          severity: "warning",
          message: `No project graph path was found from "${from.id}" to "${to.id}".`,
        },
      ],
    };
  }

  return {
    from: request.from,
    to: request.to,
    found: true,
    nodes: pathIds
      .map((nodeId) => graph.nodes.find((node) => node.id === nodeId))
      .filter((node): node is ProjectGraphNode => node !== undefined),
    edges: edgesForPath(graph, pathIds),
    diagnostics: [],
  };
}

export function createWorkspaceProjectGraph(
  input: WorkspaceProjectGraphBuildInput,
): ProjectGraph {
  const nodes = new Map<string, ProjectGraphNode>();
  const edges = new Map<string, ProjectGraphEdge>();
  const packages = input.workspace.packages.map((item) =>
    normalizeWorkspacePackage(item),
  );

  for (const packageEntry of packages) {
    const packageFile = findFile(input.files, `${packageEntry.path}/package.json`);
    const readmeFile = findFile(input.files, `${packageEntry.path}/README.md`);
    const packageSummary =
      readPackageDescription(packageFile?.text) ??
      readMarkdownSummary(readmeFile?.text) ??
      packageEntry.role;

    // Point the package node at a source file that ACTUALLY EXISTS: the README when present, else the
    // package.json (always present — packages are derived from it), else the package dir. Previously
    // this was hardcoded to `${path}/README.md` even for README-less packages, producing a DANGLING
    // sourcePath (a node referencing a non-existent file) — caught now by the graph-integrity audit.
    const packageSourcePath =
      readmeFile !== undefined
        ? `${packageEntry.path}/README.md`
        : packageFile !== undefined
          ? `${packageEntry.path}/package.json`
          : packageEntry.path;

    addNode(
      nodes,
      createPackageNode(
        packageNodeId(packageEntry.name),
        packageEntry.name,
        packageSourcePath,
        packageSummary,
      ),
    );
  }

  for (const file of input.files) {
    const owner = findOwningPackage(file.path, packages);
    const documentNode = createFileNode(file, owner);

    if (documentNode !== undefined) {
      addNode(nodes, documentNode);

      if (owner !== undefined) {
        addEdge(
          edges,
          createProjectGraphEdge(
            packageNodeId(owner.name),
            documentNode.id,
            "owns",
            "EXTRACTED",
            file.path,
          ),
        );
      }
    }

    if (file.kind === "typescript") {
      for (const exportNode of extractTypeScriptExports(file, owner)) {
        addNode(nodes, exportNode);

        if (owner !== undefined) {
          addEdge(
            edges,
            createProjectGraphEdge(
              packageNodeId(owner.name),
              exportNode.id,
              "provides",
              "EXTRACTED",
              file.path,
            ),
          );
        }
      }
    }

    if (file.kind === "logicn-source") {
      for (const symbolNode of extractLogicnSymbols(file, owner)) {
        addNode(nodes, symbolNode);

        if (owner !== undefined) {
          addEdge(
            edges,
            createProjectGraphEdge(
              packageNodeId(owner.name),
              symbolNode.id,
              "provides",
              "EXTRACTED",
              file.path,
            ),
          );
        }
      }
    }

    if (file.kind === "markdown") {
      addMarkdownPackageReferenceEdges(file, packages, nodes, edges);
    }

    if (file.path.endsWith("package.json") && owner !== undefined) {
      addPackageDependencyEdges(file, owner, packages, edges);
    }
  }

  for (const [docName, docPath] of Object.entries(input.workspace.docs ?? {})) {
    const docNodeId = documentNodeId(docPath);
    if (!nodes.has(docNodeId)) {
      addNode(
        nodes,
        createDocumentNode(docNodeId, docName, docPath, ["document", "workspace-doc"]),
      );
    }
  }

  const projectGraphDocPath = input.workspace.docs?.projectGraph;
  const graphPackage =
    (projectGraphDocPath === undefined
      ? undefined
      : packages.find((item) => item.path === normalizePath(projectGraphDocPath))) ??
    packages.find((item) => item.name === "logicn-devtools-graph-project");
  const reportNode: ProjectGraphNode = {
    id: "report:project-graph",
    kind: "Report",
    label: "LogicN Project Graph Report",
    sourcePath: "build/graph/LogicN_GRAPH_REPORT.md",
    tags: ["report", "project-graph"],
  };
  addNode(nodes, reportNode);

  if (graphPackage !== undefined) {
    addEdge(
      edges,
      createProjectGraphEdge(
        packageNodeId(graphPackage.name),
        reportNode.id,
        "generates",
        "INFERRED",
        `${graphPackage.path}/README.md`,
      ),
    );
  }

  return {
    version: "0.1.0",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

export function createDefaultProjectGraphOutputManifest(
  outputDirectory = "build/graph",
): ProjectGraphOutputManifest {
  return {
    jsonPath: `${outputDirectory}/logicn-devtools-project-graph.json`,
    htmlPath: `${outputDirectory}/logicn-devtools-project-graph.html`,
    reportPath: `${outputDirectory}/LogicN_GRAPH_REPORT.md`,
    aiMapPath: `${outputDirectory}/logicn-ai-map.md`,
    generatedFiles: [
      `${outputDirectory}/logicn-devtools-project-graph.json`,
      `${outputDirectory}/logicn-devtools-project-graph.html`,
      `${outputDirectory}/LogicN_GRAPH_REPORT.md`,
      `${outputDirectory}/logicn-ai-map.md`,
    ],
  };
}

export function renderProjectGraphMarkdownReport(
  workspace: ProjectGraphWorkspaceConfig,
  graph: ProjectGraph,
): string {
  const packages = graph.nodes.filter((node) => node.kind === "Package");
  const documents = graph.nodes.filter((node) => node.kind === "Document");
  const types = graph.nodes.filter((node) => node.kind === "Type");
  const functions = graph.nodes.filter((node) => node.kind === "Flow");

  return [
    "# LogicN Graph Report",
    "",
    `Workspace: ${workspace.name}`,
    `Generated: ${graph.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Packages: ${packages.length}`,
    `- Documents: ${documents.length}`,
    `- Types/interfaces: ${types.length}`,
    `- Functions: ${functions.length}`,
    `- Relationships: ${graph.edges.length}`,
    "",
    "## Package Nodes",
    "",
    ...packages.map((node) => `- ${node.label} (${node.sourcePath ?? "no source"})`),
    "",
    "## High-Signal Questions",
    "",
    "- Which package owns a concept?",
    "- Which package provides a type or helper?",
    "- Which docs mention a package?",
    "- Which packages depend on each other?",
    "",
  ].join("\n");
}

export function renderProjectGraphAiMap(graph: ProjectGraph): string {
  const lines = ["# LogicN AI Map", ""];

  for (const node of graph.nodes) {
    if (node.kind !== "Package") {
      continue;
    }

    const provides = graph.edges
      .filter((edge) => edge.from === node.id && edge.kind === "provides")
      .map((edge) => graph.nodes.find((candidate) => candidate.id === edge.to))
      .filter((candidate): candidate is ProjectGraphNode => candidate !== undefined)
      .slice(0, 12);

    lines.push(`## ${node.label}`);
    if (node.summary !== undefined) {
      lines.push("", node.summary);
    }
    if (provides.length > 0) {
      lines.push("", "Provides:");
      lines.push(...provides.map((item) => `- ${item.label}`));
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function validateProjectGraph(
  graph: ProjectGraph,
): readonly ProjectGraphDiagnostic[] {
  const diagnostics: ProjectGraphDiagnostic[] = [];
  const nodeIds = new Set<string>();

  graph.nodes.forEach((node, index) => {
    if (node.id.trim().length === 0) {
      diagnostics.push({
        code: "LogicN_PROJECT_GRAPH_NODE_ID_REQUIRED",
        severity: "error",
        message: "Project graph node requires an id.",
        path: `nodes.${index}.id`,
      });
      return;
    }

    if (nodeIds.has(node.id)) {
      diagnostics.push({
        code: "LogicN_PROJECT_GRAPH_NODE_ID_DUPLICATE",
        severity: "error",
        message: `Project graph node id "${node.id}" is duplicated.`,
        path: `nodes.${index}.id`,
      });
    }

    nodeIds.add(node.id);
  });

  graph.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.from)) {
      diagnostics.push({
        code: "LogicN_PROJECT_GRAPH_EDGE_FROM_MISSING",
        severity: "error",
        message: `Project graph edge references missing source node "${edge.from}".`,
        path: `edges.${index}.from`,
      });
    }

    if (!nodeIds.has(edge.to)) {
      diagnostics.push({
        code: "LogicN_PROJECT_GRAPH_EDGE_TO_MISSING",
        severity: "error",
        message: `Project graph edge references missing target node "${edge.to}".`,
        path: `edges.${index}.to`,
      });
    }

    if (edge.confidence === "AMBIGUOUS" && edge.rationale === undefined) {
      diagnostics.push({
        code: "LogicN_PROJECT_GRAPH_AMBIGUOUS_EDGE_NEEDS_RATIONALE",
        severity: "warning",
        message: "Ambiguous project graph edges should explain their rationale.",
        path: `edges.${index}.rationale`,
      });
    }
  });

  return diagnostics;
}

export function createPackageNode(
  id: string,
  label: string,
  sourcePath: string,
  summary?: string,
): ProjectGraphNode {
  return {
    id,
    kind: "Package",
    label,
    sourcePath,
    ...(summary === undefined ? {} : { summary }),
    tags: ["package"],
  };
}

export function createDocumentNode(
  id: string,
  label: string,
  sourcePath: string,
  tags: readonly string[] = ["document"],
): ProjectGraphNode {
  return {
    id,
    kind: "Document",
    label,
    sourcePath,
    tags,
  };
}

export function createProjectGraphEdge(
  from: string,
  to: string,
  kind: ProjectGraphEdgeKind,
  confidence: ProjectGraphConfidence = "EXTRACTED",
  evidencePath?: string,
): ProjectGraphEdge {
  return {
    from,
    to,
    kind,
    confidence,
    ...(evidencePath === undefined ? {} : { evidencePath }),
  };
}

function normalizeWorkspacePackage(
  input: ProjectGraphWorkspacePackage,
): Required<Pick<ProjectGraphWorkspacePackage, "path" | "name">> &
  Pick<ProjectGraphWorkspacePackage, "role"> {
  const normalizedPath = normalizePath(input.path);
  const name = input.name ?? normalizedPath.split("/").at(-1) ?? normalizedPath;

  return {
    path: normalizedPath,
    name,
    ...(input.role === undefined ? {} : { role: input.role }),
  };
}

function createFileNode(
  file: ProjectGraphWorkspaceFile,
  owner?: ReturnType<typeof normalizeWorkspacePackage>,
): ProjectGraphNode | undefined {
  if (
    file.kind !== "markdown" &&
    file.kind !== "json" &&
    file.kind !== "logicn-source"
  ) {
    return undefined;
  }

  const label = file.path.split("/").at(-1) ?? file.path;
  const tags = [
    file.kind === "markdown"
      ? "document"
      : file.kind === "logicn-source"
        ? "logicn-source"
        : "report",
    ...(owner === undefined ? [] : [owner.name]),
  ];

  if (file.kind === "json" && file.path.toLowerCase().includes("report")) {
    return {
      id: reportNodeId(file.path),
      kind: "Report",
      label,
      sourcePath: file.path,
      tags,
    };
  }

  return createDocumentNode(documentNodeId(file.path), label, file.path, tags);
}

function extractTypeScriptExports(
  file: ProjectGraphWorkspaceFile,
  owner?: ReturnType<typeof normalizeWorkspacePackage>,
): readonly ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  const exportPattern =
    /export\s+(?:declare\s+)?(?:interface|type|class|const|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g;

  for (const match of file.text.matchAll(exportPattern)) {
    const name = match[1];
    if (name === undefined) {
      continue;
    }

    const declaration = match[0];
    const kind = declaration.includes("function") ? "Flow" : "Type";
    nodes.push({
      id: `${kind.toLowerCase()}:${owner?.name ?? "workspace"}:${name}`,
      kind,
      label: name,
      sourcePath: file.path,
      tags: [
        kind === "Flow" ? "function" : "type",
        ...(owner === undefined ? [] : [owner.name]),
      ],
    });
  }

  return nodes;
}

function extractLogicnSymbols(
  file: ProjectGraphWorkspaceFile,
  owner?: ReturnType<typeof normalizeWorkspacePackage>,
): readonly ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  // LogicN top-level declarations. Mirrors extractTypeScriptExports so that
  // pure-.lln packages expose their flows/contracts as graph nodes (#177) —
  // previously every .lln file (kind "logicn-source") was silently dropped.
  const declPattern =
    /(?:^|\n)\s*(?:export\s+)?(?:governed\s+)?(flow|contract|enum|record|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g;

  for (const match of file.text.matchAll(declPattern)) {
    const keyword = match[1];
    const name = match[2];
    if (keyword === undefined || name === undefined) {
      continue;
    }

    const kind = keyword === "flow" ? "Flow" : "Type";
    nodes.push({
      id: `${kind.toLowerCase()}:${owner?.name ?? "workspace"}:${name}`,
      kind,
      label: name,
      sourcePath: file.path,
      tags: [
        kind === "Flow" ? "function" : "type",
        "logicn-source",
        ...(owner === undefined ? [] : [owner.name]),
      ],
    });
  }

  return nodes;
}

function addMarkdownPackageReferenceEdges(
  file: ProjectGraphWorkspaceFile,
  packages: readonly ReturnType<typeof normalizeWorkspacePackage>[],
  nodes: Map<string, ProjectGraphNode>,
  edges: Map<string, ProjectGraphEdge>,
): void {
  const documentId = documentNodeId(file.path);
  if (!nodes.has(documentId)) {
    return;
  }

  for (const packageEntry of packages) {
    if (
      file.text.includes(packageEntry.name) ||
      file.text.includes(packageEntry.path)
    ) {
      addEdge(
        edges,
        createProjectGraphEdge(
          documentId,
          packageNodeId(packageEntry.name),
          "documents",
          "INFERRED",
          file.path,
        ),
      );
    }
  }
}

function addPackageDependencyEdges(
  file: ProjectGraphWorkspaceFile,
  owner: ReturnType<typeof normalizeWorkspacePackage>,
  packages: readonly ReturnType<typeof normalizeWorkspacePackage>[],
  edges: Map<string, ProjectGraphEdge>,
): void {
  const dependencies = readPackageDependencies(file.text);

  for (const dependency of dependencies) {
    const targetPackage = packages.find(
      (item) => `@logicn/${item.name.replace(/^logicn-/, "")}` === dependency,
    );
    if (targetPackage === undefined) {
      continue;
    }

    addEdge(
      edges,
      createProjectGraphEdge(
        packageNodeId(owner.name),
        packageNodeId(targetPackage.name),
        "depends_on",
        "EXTRACTED",
        file.path,
      ),
    );
  }
}

function readPackageDescription(text?: string): string | undefined {
  if (text === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "description" in parsed &&
      typeof parsed.description === "string"
    ) {
      return parsed.description;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readPackageDependencies(text: string): readonly string[] {
  try {
    const parsed = JSON.parse(text) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
    };
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

function readMarkdownSummary(text?: string): string | undefined {
  if (text === undefined) {
    return undefined;
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
}

function findFile(
  files: readonly ProjectGraphWorkspaceFile[],
  path: string,
): ProjectGraphWorkspaceFile | undefined {
  const normalizedPath = normalizePath(path);
  return files.find((file) => normalizePath(file.path) === normalizedPath);
}

function findOwningPackage(
  path: string,
  packages: readonly ReturnType<typeof normalizeWorkspacePackage>[],
): ReturnType<typeof normalizeWorkspacePackage> | undefined {
  const normalizedPath = normalizePath(path);
  return packages
    .filter((item) => normalizedPath.startsWith(`${item.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function addNode(
  nodes: Map<string, ProjectGraphNode>,
  node: ProjectGraphNode,
): void {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function addEdge(
  edges: Map<string, ProjectGraphEdge>,
  edge: ProjectGraphEdge,
): void {
  edges.set(`${edge.from}->${edge.kind}->${edge.to}`, edge);
}

function packageNodeId(name: string): string {
  return `package:${name}`;
}

function documentNodeId(path: string): string {
  return `doc:${normalizePath(path)}`;
}

function reportNodeId(path: string): string {
  return `report:${normalizePath(path)}`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function nodeMatchesQuery(node: ProjectGraphNode, query: string): boolean {
  return [
    node.id,
    node.label,
    node.sourcePath ?? "",
    node.summary ?? "",
    ...node.tags,
  ].some((value) => value.toLowerCase().includes(query));
}

function edgeMatchesQuery(edge: ProjectGraphEdge, query: string): boolean {
  return [
    edge.from,
    edge.to,
    edge.kind,
    edge.evidencePath ?? "",
    edge.rationale ?? "",
  ].some((value) => value.toLowerCase().includes(query));
}

function findGraphNode(
  graph: ProjectGraph,
  idOrLabel: string,
): ProjectGraphNode | undefined {
  const query = normalizeQuery(idOrLabel);
  return graph.nodes.find(
    (node) =>
      node.id.toLowerCase() === query ||
      node.label.toLowerCase() === query ||
      node.id.toLowerCase().endsWith(`:${query}`),
  );
}

function edgesForPath(
  graph: ProjectGraph,
  path: readonly string[],
): readonly ProjectGraphEdge[] {
  const edges: ProjectGraphEdge[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    const edge = graph.edges.find((item) => item.from === from && item.to === to);
    if (edge !== undefined) {
      edges.push(edge);
    }
  }

  return edges;
}
