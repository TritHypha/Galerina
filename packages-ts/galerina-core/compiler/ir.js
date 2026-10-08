"use strict";

// Prototype IR format (TODO Create IR format, SuperGrok 2026-10-08j).
// Schema galerina.core.ir.v1 is a structured program IR of admitted AST
// units. It is not a bytecode ISA and does not claim native execution.

const SCHEMA = "galerina.core.ir.v1";

function unit(kind, name, extra) {
  return { kind, name: name || "", ...extra };
}

function buildIr(ast, symbols) {
  const units = [];
  for (const type of ast.types || []) {
    units.push(unit("type", type.name, {
      alias: type.alias || null,
      fieldCount: (type.fields || []).length,
      file: type.file,
      line: type.line
    }));
  }
  for (const item of ast.enums || []) {
    units.push(unit("enum", item.name, {
      cases: item.cases || [],
      file: item.file,
      line: item.line
    }));
  }
  for (const flow of ast.flows || []) {
    units.push(unit("flow", flow.name, {
      qualifier: flow.qualifier || "normal",
      async: Boolean(flow.async),
      vectorMode: flow.vectorMode || "scalar",
      effects: flow.effects || [],
      params: flow.params || [],
      returns: flow.returns || null,
      file: flow.file,
      line: flow.line
    }));
  }
  for (const api of ast.apis || []) {
    units.push(unit("api", api.name, {
      routes: (api.routes || []).map((route) => ({
        method: route.method,
        path: route.path,
        handler: route.handler || null
      })),
      file: api.file,
      line: api.line
    }));
  }
  for (const webhook of ast.webhooks || []) {
    units.push(unit("webhook", webhook.name, {
      path: webhook.path || null,
      file: webhook.file,
      line: webhook.line
    }));
  }
  for (const block of ast.vectorizeBlocks || []) {
    units.push(unit("vectorize", block.source, {
      columns: (block.columns || []).map((column) => column.name),
      file: block.file,
      line: block.line
    }));
  }
  return {
    schema: SCHEMA,
    language: ast.language || "Galerina",
    compiler: ast.compiler,
    project: ast.project,
    symbolSchema: symbols && symbols.schema ? symbols.schema : null,
    unitCount: units.length,
    units
  };
}

function admitIr(ir) {
  if (!ir || ir.schema !== SCHEMA || !Array.isArray(ir.units)) {
    return { status: "REFUSED", problem: "IR is not galerina.core.ir.v1." };
  }
  return { status: "ADMITTED", ir };
}

module.exports = {
  SCHEMA,
  buildIr,
  admitIr
};
