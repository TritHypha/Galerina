"use strict";

const fs = require("fs");

function formatSource(content) {
  const normalised = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const inputLines = normalised.split("\n");
  const output = [];
  let indent = 0;
  let blankRun = 0;

  for (const rawLine of inputLines) {
    const trimmedRight = rawLine.replace(/[ \t]+$/g, "");
    const trimmed = trimmedRight.trim();

    if (trimmed === "") {
      blankRun += 1;
      if (blankRun <= 1 && output.length > 0) {
        output.push("");
      }
      continue;
    }

    blankRun = 0;
    const leadingClosers = countLeadingClosers(trimmed);
    const currentIndent = Math.max(0, indent - leadingClosers);
    output.push(`${"  ".repeat(currentIndent)}${trimmed}`);
    indent = Math.max(0, indent + braceDelta(trimmed));
  }

  while (output.length > 0 && output[output.length - 1] === "") {
    output.pop();
  }

  return output.join("\n") + "\n";
}

function formatProject(project, options = {}) {
  const check = options.check === true;
  const results = [];

  for (const source of project.files) {
    const normalised = source.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const formatted = formatSource(source.content);
    const changed = formatted !== normalised;
    results.push({ file: source.relativePath, changed });

    if (changed && check === false) {
      fs.writeFileSync(source.path, formatted, "utf8");
      source.content = formatted;
    }
  }

  return results;
}

function braceDelta(line) {
  const code = stripStringAndCommentContent(line);
  let delta = 0;
  for (const char of code) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

function countLeadingClosers(line) {
  let count = 0;
  for (const char of line) {
    if (char === "}") {
      count += 1;
    } else if (char !== ")" && char !== "]" && char !== " " && char !== "\t") {
      break;
    }
  }
  return count;
}

function stripStringAndCommentContent(line) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (inString === false && char === "/" && next === "/") {
      break;
    }

    if (char === "\"" && escaped === false) {
      inString = !inString;
      output += "\"";
    } else if (inString === false) {
      output += char;
    }

    escaped = char === "\\" && escaped === false;
    if (char !== "\\") escaped = false;
  }

  return output;
}

module.exports = {
  formatProject,
  formatSource
};
