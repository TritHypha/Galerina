"use strict";

const KEYWORDS = new Set([
  "api",
  "ai_guide",
  "await",
  "catch",
  "cache_ir",
  "channel",
  "checkpoint",
  "compute",
  "config",
  "const",
  "effects",
  "else",
  "entry",
  "enum",
  "fallback",
  "flow",
  "for",
  "global_mutation",
  "globals",
  "hard_limit",
  "handler",
  "hot_reload",
  "if",
  "imports",
  "in",
  "language",
  "let",
  "map_manifest",
  "match",
  "method",
  "mut",
  "memory",
  "on_pressure",
  "parallel",
  "permissions",
  "prefer",
  "project",
  "pure",
  "return",
  "rollback",
  "run_mode",
  "runtime",
  "secure",
  "security",
  "secret",
  "state",
  "soft_limit",
  "spill",
  "target",
  "targets",
  "test",
  "type",
  "use",
  "wait",
  "webhook",
  "while",
  "worker"
]);

const BOOLEAN_LITERALS = new Set(["true", "false"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const MULTI_CHAR_OPERATORS = ["->", "=>", "==", "!=", "<=", ">=", "&&", "||", "::"];
const SINGLE_CHAR_SYMBOLS = new Set(["{", "}", "(", ")", "[", "]", ",", ".", ":", ";", "<", ">", "=", "+", "-", "*", "/", "%"]);

function lexSource(source) {
  const content = source.content;
  const tokens = [];
  const diagnostics = [];
  let index = 0;
  let line = 1;
  let column = 1;

  while (index < content.length) {
    const char = content[index];
    const start = position();

    if (char === "\r") {
      advance();
      continue;
    }

    if (char === "\n") {
      tokens.push(token("newline", "\\n", start, index, index + 1));
      advance();
      continue;
    }

    if (isWhitespace(char)) {
      consumeWhile(isWhitespace);
      continue;
    }

    if (char === "/" && content[index + 1] === "/") {
      const doc = content[index + 2] === "/";
      const value = consumeUntilNewline();
      tokens.push(token(doc ? "docComment" : "comment", value, start, start.index, index));
      continue;
    }

    if (char === "\"") {
      readString(source, tokens, diagnostics, start);
      continue;
    }

    if (isDigit(char)) {
      readNumber(tokens, start);
      continue;
    }

    if (isIdentifierStart(char)) {
      readIdentifier(tokens, start);
      continue;
    }

    const operator = MULTI_CHAR_OPERATORS.find((op) => content.startsWith(op, index));
    if (operator) {
      consume(operator.length);
      tokens.push(token("operator", operator, start, start.index, index));
      continue;
    }

    if (SINGLE_CHAR_SYMBOLS.has(char)) {
      advance();
      tokens.push(token(isOperatorSymbol(char) ? "operator" : "symbol", char, start, start.index, index));
      continue;
    }

    diagnostics.push({
      severity: "error",
      errorType: "LexError",
      file: source.relativePath,
      line: start.line,
      column: start.column,
      problem: `Unexpected character '${char}'.`,
      suggestedFix: "Remove the character or add it to the Galerina grammar before using it."
    });
    advance();
  }

  tokens.push(token("eof", "", position(), index, index));
  return { tokens, diagnostics };

  function readString(src, output, errors, startPos) {
    let value = "\"";
    advance();
    let escaped = false;

    while (index < content.length) {
      const current = content[index];
      value += current;

      if (current === "\n" && !escaped) {
        errors.push({
          severity: "error",
          errorType: "LexError",
          file: src.relativePath,
          line: startPos.line,
          column: startPos.column,
          problem: "String literal is not closed before the end of the line.",
          suggestedFix: "Close the string with a double quote or escape the newline explicitly."
        });
        advance();
        output.push(token("string", value, startPos, startPos.index, index));
        return;
      }

      advance();

      if (current === "\"" && !escaped) {
        output.push(token("string", value, startPos, startPos.index, index));
        return;
      }

      escaped = current === "\\" && !escaped;
      if (current !== "\\") escaped = false;
    }

    errors.push({
      severity: "error",
      errorType: "LexError",
      file: src.relativePath,
      line: startPos.line,
      column: startPos.column,
      problem: "String literal reached the end of file without closing.",
      suggestedFix: "Add a closing double quote."
    });
    output.push(token("string", value, startPos, startPos.index, index));
  }

  function readNumber(output, startPos) {
    let value = "";
    value += consumeWhile(isDigit);
    if (content[index] === "." && isDigit(content[index + 1])) {
      value += ".";
      advance();
      value += consumeWhile(isDigit);
    }

    const suffix = consumeWhile(isLetter);
    value += suffix;

    let type = value.includes(".") ? "decimal" : "integer";
    if (/^\d+(ms|s|m|h|d)$/.test(value)) type = "duration";
    if (/^\d+(b|kb|mb|gb)$/.test(value)) type = "size";
    if (/^\d+\.\d+(f16|f32|f64)?$/.test(value)) type = "decimal";
    output.push(token(type, value, startPos, startPos.index, index));
  }

  function readIdentifier(output, startPos) {
    const value = consumeWhile(isIdentifierPart);
    let type = "identifier";
    if (KEYWORDS.has(value)) type = "keyword";
    if (BOOLEAN_LITERALS.has(value)) type = "boolean";
    if (HTTP_METHODS.has(value)) type = "httpMethod";
    if (/^[A-Z]/.test(value) && type === "identifier") type = "typeIdentifier";
    output.push(token(type, value, startPos, startPos.index, index));
  }

  function token(type, value, startPos, startIndex, endIndex) {
    return {
      type,
      value,
      file: source.relativePath,
      line: startPos.line,
      column: startPos.column,
      offset: startIndex,
      length: Math.max(0, endIndex - startIndex)
    };
  }

  function position() {
    return { line, column, index };
  }

  function advance() {
    if (content[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    index += 1;
  }

  function consume(count) {
    for (let i = 0; i < count; i += 1) advance();
  }

  function consumeWhile(predicate) {
    let value = "";
    while (index < content.length && predicate(content[index])) {
      value += content[index];
      advance();
    }
    return value;
  }

  function consumeUntilNewline() {
    let value = "";
    while (index < content.length && content[index] !== "\n") {
      value += content[index];
      advance();
    }
    return value;
  }
}

function isWhitespace(char) {
  return char === " " || char === "\t";
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}

function isLetter(char) {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function isIdentifierStart(char) {
  return isLetter(char) || char === "_";
}

function isIdentifierPart(char) {
  return isIdentifierStart(char) || isDigit(char);
}

function isOperatorSymbol(char) {
  return ["<", ">", "=", "+", "-", "*", "/", "%"].includes(char);
}

module.exports = {
  lexSource
};
