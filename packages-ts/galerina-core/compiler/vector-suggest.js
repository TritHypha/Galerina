"use strict";

// Vector suggestion command (TODO L867, SuperGrok 2026-10-08i).
// Galerina suggest vector reports candidate loops. It does not rewrite source.
// Side-effectful loop bodies are skipped fail-closed.

const { stripComments, findMatchingBrace } = require("./parser");

const ADMITTED_SUGGEST_COMMAND = "vector";
const SIDE_EFFECT_MARKERS = [
  "database.",
  "fetch(",
  "http.",
  "network.",
  "writeFile",
  "readFile",
  "secret",
  "env.",
  "await ",
  "print(",
  "console.log"
];

function admitSuggestCommand(kind) {
  if (kind === ADMITTED_SUGGEST_COMMAND) {
    return { status: "ADMITTED", command: kind };
  }
  return {
    status: "REFUSED",
    command: kind || "",
    problem: "Galerina suggest admits only the vector command.",
    suggestedFix: "Run: Galerina suggest vector <file-or-dir>"
  };
}

function suggestVector(project) {
  const suggestions = [];
  for (const source of project.files) {
    suggestions.push(...suggestVectorInSource(source));
  }
  return {
    schema: "galerina.core.vector-suggest.v1",
    command: "suggest vector",
    rewritten: false,
    files: project.files.length,
    suggestions
  };
}

function suggestVectorInSource(source) {
  const content = stripComments(source.content);
  const suggestions = [];
  const loop = /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\{/g;
  let match;
  while ((match = loop.exec(content)) !== null) {
    const open = content.indexOf("{", match.index);
    const close = findMatchingBrace(content, open);
    if (close === -1) continue;
    const body = content.slice(open + 1, close);
    if (SIDE_EFFECT_MARKERS.some((marker) => body.includes(marker))) continue;
    const add = body.match(/([A-Za-z_][A-Za-z0-9_]*)\.add\s*\(([\s\S]*?)\)/);
    const item = match[1];
    const collection = match[2];
    if (!add || !add[2].includes(item)) continue;
    const before = content.slice(0, match.index);
    const line = before.split(/\r?\n/).length;
    const expression = add[2].trim();
    suggestions.push({
      file: source.relativePath,
      line,
      current: "for " + item + " in " + collection + " { " + body.trim() + " }",
      suggested: "let " + add[1] + " = vector " + collection + " {\n  " + item + " => " + expression + "\n}",
      reason: "This loop may be suitable for vector syntax."
    });
    loop.lastIndex = close + 1;
  }
  return suggestions;
}

function formatVectorSuggestions(report) {
  if (report.suggestions.length === 0) {
    return "Galerina suggest vector: 0 suggestions. Source files were not rewritten.";
  }
  const blocks = report.suggestions.map((item) => {
    return [
      item.file + ":" + item.line,
      "",
      item.reason,
      "",
      "Current:",
      item.current,
      "",
      "Suggested:",
      item.suggested
    ].join("\n");
  });
  return blocks.join("\n\n") + "\n\nGalerina suggest vector: " + report.suggestions.length +
    " suggestions. Source files were not rewritten.";
}

module.exports = {
  ADMITTED_SUGGEST_COMMAND,
  admitSuggestCommand,
  suggestVector,
  formatVectorSuggestions
};
