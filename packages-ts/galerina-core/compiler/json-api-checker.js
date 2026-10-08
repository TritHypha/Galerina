"use strict";

// Dedicated JSON/API checker (TODO Create JSON/API checker, SuperGrok 2026-10-08j).
// Fail closed on mutating routes without handler or max_body_size, missing
// handler flows, and json_policy unknown_fields other than deny.
// Does not invent route frameworks.

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function checkJsonApi(ast, symbols, diagnostics) {
  const flowNames = new Set(Object.keys((symbols && symbols.flows) || {}));
  for (const flow of ast.flows || []) {
    if (flow.name) flowNames.add(flow.name);
  }

  for (const api of ast.apis || []) {
    for (const route of api.routes || []) {
      if (!route.handler) {
        diagnostics.push({
          severity: "error",
          errorType: "JsonApiCheckError",
          file: api.file,
          line: api.line,
          column: api.column,
          problem: "API " + api.name + " " + route.method + " " + route.path + " has no handler.",
          suggestedFix: "Add handler <flowName> to the route."
        });
      } else if (!flowNames.has(route.handler)) {
        diagnostics.push({
          severity: "error",
          errorType: "JsonApiCheckError",
          file: api.file,
          line: api.line,
          column: api.column,
          problem: "API " + api.name + " handler " + route.handler + " is not a declared flow.",
          suggestedFix: "Declare flow " + route.handler + " or point the route at an existing flow."
        });
      }
      if (MUTATING.has(route.method) && !route.maxBodySize) {
        diagnostics.push({
          severity: "error",
          errorType: "JsonApiCheckError",
          file: api.file,
          line: api.line,
          column: api.column,
          problem: "API " + api.name + " " + route.method + " " + route.path + " has no max_body_size.",
          suggestedFix: "Add max_body_size to the mutating route."
        });
      }
    }
  }

  for (const policy of ast.jsonPolicies || []) {
    const settings = policy.settings || {};
    const unknown = settings.unknown_fields || settings.unknownFields;
    if (unknown && unknown !== "deny") {
      diagnostics.push({
        severity: "error",
        errorType: "JsonApiCheckError",
        file: policy.file,
        line: policy.line,
        column: policy.column,
        problem: "json_policy unknown_fields is " + unknown + ".",
        suggestedFix: "Set unknown_fields deny."
      });
    }
  }
}

module.exports = {
  checkJsonApi
};
