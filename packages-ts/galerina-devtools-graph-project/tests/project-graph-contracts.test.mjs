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
      "packages-ts/galerina-core-security/README.md",
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
      sourcePath: "packages-ts/galerina-core-security/src/index.ts",
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

function auditedRuntimeDependencies(specifiers) {
  const packageNames = ["galerina-core-compiler", "galerina-core-runtime-wasm", "galerina-core-runtime-wasm-tools"];
  return createWorkspaceProjectGraph({
    workspace: { name: "audited-subpaths", packages: packageNames.map(name => ({ path: `packages-ts/${name}` })) },
    generatedAt: "2026-10-10T00:00:00.000Z",
    files: [{
      path: "packages-ts/galerina-core-compiler/.graph/package-graph.json",
      kind: "json",
      text: JSON.stringify({
        packageName: "@galerina/core-compiler",
        externalDeps: specifiers.map(specifier => ({ specifier, kind: "workspace", importedBy: ["src/decimal-arith.ts"] })),
      }),
    }],
  });
}

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
          { path: "packages-ts/galerina-core-security" },
          { path: "packages-ts/galerina-devtools-project-graph" },
        ],
        docs: {
          security: "docs/SECURITY.md",
        },
      },
      generatedAt: "2026-05-08T00:00:00.000Z",
      files: [
        {
          path: "packages-ts/galerina-core-security/package.json",
          kind: "json",
          text: JSON.stringify({
            name: "@galerina/core-security",
            description: "Reusable security primitives.",
          }),
        },
        {
          path: "packages-ts/galerina-core-security/README.md",
          kind: "markdown",
          text: "# Galerina Security\n\nReusable security primitives.",
        },
        {
          path: "packages-ts/galerina-core-security/src/index.ts",
          kind: "typescript",
          text: "export interface SecureStringReference {}\nexport function redactText() {}",
        },
        {
          path: "docs/SECURITY.md",
          kind: "markdown",
          text: "Security docs mention packages-ts/galerina-core-security and galerina-devtools-project-graph.",
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

  it("derives package dependencies from the audited import surface", () => {
    const workspaceGraph = createWorkspaceProjectGraph({
      workspace: {
        name: "Galerina-test",
        packages: [
          { path: "packages-ts/galerina-alpha" },
          { path: "packages-ts/galerina-beta" },
        ],
      },
      generatedAt: "2026-05-08T00:00:00.000Z",
      files: [
        {
          path: "packages-ts/galerina-alpha/package.json",
          kind: "json",
          text: JSON.stringify({
            name: "@galerina/alpha",
            devDependencies: { "@galerina/beta": "file:../galerina-beta" },
          }),
        },
        {
          path: "packages-ts/galerina-beta/package.json",
          kind: "json",
          text: JSON.stringify({ name: "@galerina/beta" }),
        },
        {
          path: "packages-ts/galerina-alpha/.graph/package-graph.json",
          kind: "json",
          text: JSON.stringify({
            packageName: "@galerina/alpha",
            externalDeps: [],
          }),
        },
        {
          path: "packages-ts/galerina-beta/.graph/package-graph.json",
          kind: "json",
          text: JSON.stringify({
            packageName: "@galerina/beta",
            externalDeps: [
              {
                specifier: "@galerina/alpha",
                kind: "workspace",
                importedBy: ["src/index.ts"],
              },
            ],
          }),
        },
      ],
    });

    const packageDependencies = workspaceGraph.edges.filter(
      (edge) => edge.kind === "depends_on",
    );
    assert.deepEqual(
      packageDependencies.map((edge) => [edge.from, edge.to, edge.evidencePath]),
      [[
        "package:galerina-beta",
        "package:galerina-alpha",
        "packages-ts/galerina-beta/.graph/package-graph.json",
      ]],
    );
  });

  it("maps the exact Decimal leaf and root imports to the registered runtime package", () => {
    for (const specifier of ["@galerina/core-runtime-wasm", "@galerina/core-runtime-wasm/dist/decimal-core.js"]) {
      const result = auditedRuntimeDependencies([specifier]);
      const dependencies = result.edges.filter(edge => edge.kind === "depends_on");
      assert.equal(dependencies.length, 1);
      assert.equal(dependencies[0].from, "package:galerina-core-compiler");
      assert.equal(dependencies[0].to, "package:galerina-core-runtime-wasm");
      assert.equal(dependencies[0].confidence, "EXTRACTED");
      assert.equal(dependencies[0].evidencePath, "packages-ts/galerina-core-compiler/.graph/package-graph.json");
      assert.deepEqual(result.nodes.filter(node => node.kind === "Package").map(node => node.id), [
        "package:galerina-core-compiler", "package:galerina-core-runtime-wasm", "package:galerina-core-runtime-wasm-tools",
      ]);
      assert.deepEqual(validateProjectGraph(result), []);
      if (specifier.endsWith("decimal-core.js")) {
        assert.ok(dependencies[0].rationale.includes(specifier));
      } else {
        assert.equal(dependencies[0].rationale, undefined, "retain the root-only edge contract");
      }
    }
  });

  it("retains all exact audited import spellings when dependency edges coalesce", () => {
    const specifiers = [
      "@galerina/core-runtime-wasm/dist/record-abi.js",
      "@galerina/core-runtime-wasm",
      "@galerina/core-runtime-wasm/dist/decimal-core.js",
      "@galerina/core-runtime-wasm/dist/decimal-core.js",
    ];
    const dependencyEdges = input => auditedRuntimeDependencies(input).edges.filter(edge => edge.kind === "depends_on");
    const forward = dependencyEdges(specifiers);
    assert.equal(forward.length, 1);
    assert.equal(forward[0].rationale,
      'Audited import specifiers: ["@galerina/core-runtime-wasm","@galerina/core-runtime-wasm/dist/decimal-core.js","@galerina/core-runtime-wasm/dist/record-abi.js"]. Package ownership only; not export or runtime admission.');
    assert.deepEqual(dependencyEdges([...specifiers].reverse()), forward, "no last-import-wins provenance loss");
    assert.equal(forward[0].evidencePath, "packages-ts/galerina-core-compiler/.graph/package-graph.json");
  });

  it("keeps similar registered package names distinct", () => {
    const result = auditedRuntimeDependencies([
      "@galerina/core-runtime-wasm/dist/decimal-core.js",
      "@galerina/core-runtime-wasm-tools/nested/Tool_v1.2.js",
    ]);
    assert.deepEqual(result.edges.filter(edge => edge.kind === "depends_on").map(edge => edge.to), [
      "package:galerina-core-runtime-wasm", "package:galerina-core-runtime-wasm-tools",
    ]);
    // This is package ownership of an audited spelling, not proof that Tool_v1.2.js exists or is exported.
    assert.deepEqual(validateProjectGraph(result), []);
  });

  it("refuses unknown workspace roots instead of matching a known package prefix", () => {
    for (const specifier of [
      "@galerina/missing", "@galerina/missing/dist/decimal-core.js",
      "@galerina/core-runtime-wasm-extra/dist/decimal-core.js",
      "@galerina/core-runtime-wasmtools/dist/decimal-core.js",
      "@galerina/core-runtime/wasm/dist/decimal-core.js",
    ]) {
      assert.throws(() => auditedRuntimeDependencies([specifier]), {
        message: `Package graph packages-ts/galerina-core-compiler/.graph/package-graph.json names unregistered workspace dependency ${specifier}.`,
      });
    }
  });

  it("refuses malformed or ambiguous workspace subpath syntax without normalization", () => {
    for (const specifier of [
      "@galerina/core-runtime-wasm/", "@galerina/core-runtime-wasm//decimal-core.js",
      "@galerina/core-runtime-wasm/./decimal-core.js", "@galerina/core-runtime-wasm/../core-security/index.js",
      "@galerina/core-runtime-wasm/dist/../decimal-core.js", "@galerina/core-runtime-wasm/dist/.",
      "@galerina/core-runtime-wasm/dist/decimal-core.js/..",
      "@galerina/core-runtime-wasm/dist\\decimal-core.js",
      "@galerina/core-runtime-wasm/dist/%2e%2e/decimal-core.js", "@galerina/core-runtime-wasm/dist%2fdecimal-core.js",
      "@galerina/core-runtime-wasm/dist/decimal-core.js?query", "@galerina/core-runtime-wasm/dist/decimal-core.js#fragment",
      "@galerina/core-runtime-wasm/dist/decimal-core.js:stream", "@galerina/core-runtime-wasm/dist/a b.js",
      "@galerina/core-runtime-wasm/dist/a\u0000.js", "@galerina/core-runtime-wasm/dist/a\n.js",
      "@galerina/core-runtime-wasm/node_modules/other/index.js",
      "@galerina/core-runtime-wasm/Node_Modules/other/index.js",
      "@galerina//dist/decimal-core.js", "@galerina/../dist/decimal-core.js",
      "@galerina/Core-runtime-wasm/dist/decimal-core.js", "@other/core-runtime-wasm/dist/decimal-core.js",
      " @galerina/core-runtime-wasm/dist/decimal-core.js", "@galerina/core-runtime-wasm/dist/decimal-core.js ",
      "@galerina/core-runtime-wasm/dist/decimal-core.js\n", "@galerina/core-runtime-wasm/dist/decimal-core.js\r\n",
      "@galerina/core-runtime-wasm/dist/decim\u0430l-core.js",
    ]) {
      assert.throws(() => auditedRuntimeDependencies([specifier]), {
        message: `Package graph packages-ts/galerina-core-compiler/.graph/package-graph.json names malformed workspace dependency ${specifier}.`,
      });
    }
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
