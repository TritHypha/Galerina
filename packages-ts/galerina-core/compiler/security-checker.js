"use strict";

// Dedicated security checker (TODO Create security checker, SuperGrok 2026-10-08j).
// Fail closed on browser + server-only imports and blocked capabilities.
// Does not invent a memory-safety model.

const SERVER_ONLY_IMPORTS = [
  "environment",
  "server.database",
  "server.filesystem",
  "server.secrets",
  "payment.private",
  "filesystem.private"
];

function isServerOnlyImport(moduleName) {
  return SERVER_ONLY_IMPORTS.some((blocked) => moduleName === blocked || moduleName.startsWith(blocked + "."));
}

function capabilityForImport(moduleName) {
  if (moduleName === "browser.dom") return "dom";
  if (moduleName === "browser.forms") return "forms";
  if (moduleName === "browser.events") return "events";
  if (moduleName === "browser.http") return "fetch";
  if (moduleName === "browser.storage") return "storage";
  if (moduleName === "browser.router") return "router";
  if (moduleName === "environment") return "environment";
  if (moduleName.startsWith("server.database")) return "server_database";
  if (moduleName.startsWith("server.filesystem")) return "filesystem";
  if (moduleName.startsWith("server.secrets")) return "secrets";
  if (moduleName.startsWith("payment.private")) return "secrets";
  if (moduleName.startsWith("filesystem.private")) return "filesystem";
  return null;
}

function checkWebhookSecurity(ast, diagnostics) {
  for (const webhook of ast.webhooks || []) {
    if (!webhook.hmacHeader) {
      diagnostics.push({
        severity: "warning",
        errorType: "WebhookSecurityWarning",
        file: webhook.file,
        line: webhook.line,
        column: webhook.column,
        problem: "Webhook " + webhook.name + " does not declare an HMAC header.",
        suggestedFix: "Add hmac_header, env.secret, max_age, max_body_size, replay_protection and idempotency_key."
      });
    }
    if (!webhook.idempotencyKey) {
      diagnostics.push({
        severity: "warning",
        errorType: "WebhookIdempotencyWarning",
        file: webhook.file,
        line: webhook.line,
        column: webhook.column,
        problem: "Webhook " + webhook.name + " does not declare an idempotency key.",
        suggestedFix: "Add idempotency_key json.path(\"$.id\")."
      });
    }
  }
}

function checkTargetCapabilityImports(ast, diagnostics) {
  const browserTargets = (ast.targets || []).filter((target) => target.enabled && target.name === "browser");
  if (browserTargets.length === 0) return;

  const blockedCapabilities = new Set(ast.capabilities?.block || []);
  const browserTargetFiles = new Set(browserTargets.map((target) => target.file));
  const browserDeclaredInBoot = browserTargets.some((target) => target.file === "boot.fungi");
  for (const imported of ast.imports || []) {
    if (!browserDeclaredInBoot && !browserTargetFiles.has(imported.file)) continue;
    const capability = capabilityForImport(imported.module);
    if (isServerOnlyImport(imported.module)) {
      diagnostics.push({
        severity: "error",
        errorType: "BrowserImportBlocked",
        file: imported.file,
        line: imported.line,
        column: imported.column,
        target: "browser",
        problem: "Server-only import \"" + imported.module + "\" cannot be used in browser target.",
        suggestedFix: "Move server-only access behind an API endpoint or compile this code for a server/native target."
      });
      continue;
    }
    if (capability && blockedCapabilities.has(capability)) {
      diagnostics.push({
        severity: "error",
        errorType: "CapabilityBlockedImport",
        file: imported.file,
        line: imported.line,
        column: imported.column,
        target: "browser",
        problem: "Import \"" + imported.module + "\" requires blocked capability \"" + capability + "\".",
        suggestedFix: "Remove the import or change the capabilities block if " + capability + " is intentionally aLOwed for this target."
      });
    }
  }
}

function checkSecurity(ast, diagnostics) {
  checkWebhookSecurity(ast, diagnostics);
  checkTargetCapabilityImports(ast, diagnostics);
}

module.exports = {
  checkSecurity,
  checkWebhookSecurity,
  checkTargetCapabilityImports,
  isServerOnlyImport,
  capabilityForImport,
  SERVER_ONLY_IMPORTS
};
