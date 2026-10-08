"use strict";

// Dedicated symbol table for the Galerina prototype (TODO L989, SuperGrok 2026-10-08i).
// Fail closed on duplicate names in the same namespace. Does not invent ownership,
// FFI, or memory-checker symbols.

const SCHEMA = "galerina.core.symbol-table.v1";

function emptySymbolTable() {
  return {
    schema: SCHEMA,
    types: Object.create(null),
    enums: Object.create(null),
    flows: Object.create(null),
    globals: Object.create(null),
    apis: Object.create(null),
    webhooks: Object.create(null),
    vectorizeBlocks: [],
    duplicates: []
  };
}

function register(table, space, name, record, diagnostics) {
  if (!name) return;
  const bucket = table[space];
  if (Object.prototype.hasOwnProperty.call(bucket, name)) {
    const previous = bucket[name];
    if (previous.file === record.file) {
      const duplicate = {
        space,
        name,
        file: record.file,
        line: record.line,
        previousFile: previous.file,
        previousLine: previous.line
      };
      table.duplicates.push(duplicate);
      diagnostics.push({
        severity: "error",
        errorType: "SymbolTableDuplicate",
        file: record.file,
        line: record.line || 1,
        column: record.column || 1,
        problem: space + " '" + name + "' is declared more than once in " + record.file + ".",
        suggestedFix: "Keep one declaration for " + name + " in the " + space + " namespace of this file."
      });
      return;
    }
  }
  bucket[name] = record;
}

function buildSymbolTable(ast, diagnostics) {
  const table = emptySymbolTable();
  const errors = diagnostics || [];
  for (const type of ast.types || []) {
    register(table, "types", type.name, { kind: type.alias ? "alias" : "record", ...type }, errors);
  }
  for (const item of ast.enums || []) {
    register(table, "enums", item.name, item, errors);
  }
  for (const flow of ast.flows || []) {
    register(table, "flows", flow.name, {
      qualifier: flow.qualifier,
      async: Boolean(flow.async),
      vectorMode: flow.vectorMode,
      returns: flow.returns,
      file: flow.file,
      line: flow.line,
      column: flow.column
    }, errors);
  }
  for (const global of ast.globals || []) {
    register(table, "globals", global.name, global, errors);
  }
  for (const api of ast.apis || []) {
    register(table, "apis", api.name, api, errors);
  }
  for (const webhook of ast.webhooks || []) {
    register(table, "webhooks", webhook.name, webhook, errors);
  }
  table.vectorizeBlocks = [...(ast.vectorizeBlocks || [])];
  return table;
}

module.exports = {
  SCHEMA,
  emptySymbolTable,
  buildSymbolTable
};
