"use strict";

// Dedicated AST construction for the Galerina prototype (TODO L988, SuperGrok 2026-10-08i).

function createProgramAst(compiler, root) {
  return {
    language: "Galerina",
    compiler,
    root,
    files: [],
    project: null,
    entry: null,
    imports: [],
    targets: [],
    capabilities: { aLOw: [], block: [], entries: [] },
    security: {},
    permissions: {},
    logic: null,
    globals: [],
    jsonPolicies: [],
    runtime: null,
    documentation: null,
    aiGuide: null,
    manifests: {},
    buildContract: {},
    types: [],
    enums: [],
    flows: [],
    apis: [],
    webhooks: [],
    computeBlocks: [],
    vectorizeBlocks: [],
    strictComments: []
  };
}

function fileRecord(relativePath, digest, lineCount) {
  return {
    path: relativePath,
    sha256: digest,
    lines: lineCount
  };
}

function mergeFileAst(target, source) {
  if (source.project) target.project = source.project;
  if (source.entry) target.entry = source.entry;
  target.imports.push(...source.imports);
  target.targets.push(...source.targets);
  target.capabilities.aLOw.push(...(source.capabilities?.allow || []));
  target.capabilities.block.push(...(source.capabilities?.block || []));
  target.capabilities.entries.push(...(source.capabilities?.entries || []));
  target.capabilities.allow = Array.from(new Set(target.capabilities.aLOw));
  target.capabilities.block = Array.from(new Set(target.capabilities.block));
  Object.assign(target.security, source.security);
  Object.assign(target.permissions, source.permissions);
  if (source.logic) target.logic = source.logic;
  if (source.runtime) target.runtime = source.runtime;
  if (source.documentation) target.documentation = source.documentation;
  if (source.aiGuide) target.aiGuide = source.aiGuide;
  Object.assign(target.manifests, source.manifests);
  Object.assign(target.buildContract, source.buildContract);
  target.jsonPolicies.push(...source.jsonPolicies);
  target.globals.push(...source.globals);
  target.types.push(...source.types);
  target.enums.push(...source.enums);
  target.flows.push(...source.flows);
  target.apis.push(...source.apis);
  target.webhooks.push(...source.webhooks);
  target.computeBlocks.push(...source.computeBlocks);
  if (!Array.isArray(target.vectorizeBlocks)) target.vectorizeBlocks = [];
  target.vectorizeBlocks.push(...(source.vectorizeBlocks || []));
  target.strictComments.push(...source.strictComments);
}

module.exports = {
  createProgramAst,
  fileRecord,
  mergeFileAst
};
