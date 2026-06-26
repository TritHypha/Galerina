import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDocumentNode,
  createPackageNode,
  createWorkspaceProjectGraph,
  explainProjectGraphNode,
  findProjectGraphPath,
  createProjectGraphEdge,
  createProjectGraphReport,
  defineProjectGraphBackendPolicy,
  defineProjectGraphScanPolicy,
  selectProjectGraphBackend,
  queryProjectGraph,
  validateProjectGraphBackendReference,
  validateProjectGraph,
} from "../dist/index.js";

const graph = {
  version: "0.1.0",
  generatedAt: "2026-05-08T00:00:00.000Z",
  nodes: [
    createPackageNode(
      "package:galerina-core-security",
      "galerina-core-security",
      "packages-galerina/galerina-core-security/README.md",
      "Reusable security primitives and reports.",
    ),
    createDocumentNode(
      "doc:security",
      "Security",
      "docs/SECURITY.md",
      ["document", "security"],
    ),
    {
      id: "type:SecureString",
      kind: "Type",
      label: "SecureString",
      sourcePath: "packages-galerina/galerina-core-security/src/index.ts",
      tags: ["security", "type"],
    },
  ],
  edges: [
    createProjectGraphEdge(
      "package:galerina-core-security",
      "type:SecureString",
      "provides",
    ),
    createProjectGraphEdge("doc:security", "package:galerina-core-security", "documents"),
  ],
};

describe("galerina-devtools-project-graph contracts", () => {
  it("validates a package/document/type graph", () => {
    assert.deepEqual(validateProjectGraph(graph), []);
  });

  it("reports missing edge endpoints", () => {
    const diagnostics = validateProjectGraph({
      ...graph,
      edges: [
        ...graph.edges,
        createProjectGraphEdge("package:missing", "type:SecureString", "uses"),
      ],
    });

    assert.equal(diagnostics[0]?.code, "Galerina_PROJECT_GRAPH_EDGE_FROM_MISSING");
  });

  it("creates graph reports and scan policy defaults", () => {
    const policy = defineProjectGraphScanPolicy({
      allowModelExtraction: false,
    });
    const backend = selectProjectGraphBackend(
      [
        {
          id: "Galerina_native",
          label: "Galerina native workspace scanner",
          source: "built-in",
          capabilities: ["workspace-metadata", "json-output", "report-output"],
        },
      ],
      defineProjectGraphBackendPolicy(),
    );
    const report = createProjectGraphReport(graph, {
      jsonPath: "build/graph/galerina-devtools-project-graph.json",
      htmlPath: "build/graph/galerina-devtools-project-graph.html",
      reportPath: "build/graph/Galerina_GRAPH_REPORT.md",
      aiMapPath: "build/graph/galerina-ai-map.md",
      generatedFiles: [
        "build/graph/galerina-devtools-project-graph.json",
        "build/graph/Galerina_GRAPH_REPORT.md",
      ],
    }, backend);

    assert.equal(policy.redactSecrets, true);
    assert.equal(report.backend?.selected, "Galerina_native");
    assert.equal(report.diagnostics.length, 0);
    assert.equal(report.manifest.reportPath, "build/graph/Galerina_GRAPH_REPORT.md");
  });

  it("allows Graphify as a swappable git backend only when pinned and allowed", () => {
    const backend = {
      id: "graphify",
      label: "Graphify",
      source: "git",
      packageName: "graphify",
      gitUrl: "https://github.com/safishamsi/graphify",
      gitRef: "v0.1.0",
      capabilities: [
        "static-analysis",
        "semantic-extraction",
        "json-output",
        "html-output",
        "report-output",
      ],
    };
    const policy = defineProjectGraphBackendPolicy({
      allowGitBackends: true,
    });

    assert.deepEqual(validateProjectGraphBackendReference(backend, policy), []);
    assert.equal(
      selectProjectGraphBackend([backend], policy).selected,
      "graphify",
    );
  });

  it("rejects unpinned git backends by default", () => {
    const diagnostics = validateProjectGraphBackendReference(
      {
        id: "graphify",
        label: "Graphify",
        source: "git",
        gitUrl: "https://github.com/safishamsi/graphify",
        capabilities: ["json-output"],
      },
      defineProjectGraphBackendPolicy({
        allowGitBackends: true,
      }),
    );

    assert.equal(
      diagnostics[0]?.code,
      "Galerina_PROJECT_GRAPH_GIT_BACKEND_REF_REQUIRED",
    );
  });

  it("builds a workspace graph from package files and exported contracts", () => {
    const workspaceGraph = createWorkspaceProjectGraph({
      workspace: {
        name: "Galerina-test",
        packages: [
          { path: "packages-galerina/galerina-core-security" },
          { path: "packages-galerina/galerina-devtools-project-graph" },
        ],
        docs: {
          security: "docs/SECURITY.md",
        },
      },
      generatedAt: "2026-05-08T00:00:00.000Z",
      files: [
        {
          path: "packages-galerina/galerina-core-security/package.json",
          kind: "json",
          text: JSON.stringify({
            name: "@galerina/core-security",
            description: "Reusable security primitives.",
          }),
        },
        {
          path: "packages-galerina/galerina-core-security/README.md",
          kind: "markdown",
          text: "# Galerina Security\n\nReusable security primitives.",
        },
        {
          path: "packages-galerina/galerina-core-security/src/index.ts",
          kind: "typescript",
          text: "export interface SecureStringReference {}\nexport function redactText() {}",
        },
        {
          path: "docs/SECURITY.md",
          kind: "markdown",
          text: "Security docs mention packages-galerina/galerina-core-security and galerina-devtools-project-graph.",
        },
      ],
    });

    assert.equal(
      workspaceGraph.nodes.some((node) => node.id === "package:galerina-core-security"),
      true,
    );
    assert.equal(
      workspaceGraph.nodes.some(
        (node) => node.id === "type:galerina-core-security:SecureStringReference",
      ),
      true,
    );
    assert.equal(
      workspaceGraph.edges.some(
        (edge) =>
          edge.from === "package:galerina-core-security" &&
          edge.to === "type:galerina-core-security:SecureStringReference" &&
          edge.kind === "provides",
      ),
      true,
    );
    assert.equal(validateProjectGraph(workspaceGraph).length, 0);
  });

  it("queries, explains and finds paths through a graph", () => {
    const query = queryProjectGraph(graph, { query: "SecureString" });
    const explanation = explainProjectGraphNode(graph, {
      nodeId: "package:galerina-core-security",
    });
    const path = findProjectGraphPath(graph, {
      from: "package:galerina-core-security",
      to: "type:SecureString",
    });

    assert.equal(query.nodes.some((node) => node.id === "type:SecureString"), true);
    assert.equal(explanation.outgoing.length, 1);
    assert.equal(path.found, true);
    assert.equal(path.edges[0]?.kind, "provides");
  });
});
