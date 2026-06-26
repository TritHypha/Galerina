"use strict";

function buildJsonSchemaReport(ast) {
  const definitions = {};

  for (const item of ast.enums || []) {
    definitions[item.name] = {
      type: "string",
      enum: item.cases.map((name) => cleanCaseName(name)),
      "x-Galerina-kind": "enum"
    };
  }

  for (const type of ast.types || []) {
    definitions[type.name] = type.alias
      ? {
        ...typeRefToSchema(type.alias),
        "x-Galerina-kind": "alias",
        "x-Galerina-alias": type.alias
      }
      : objectTypeToSchema(type);
  }

  const schemas = {};
  for (const name of Object.keys(definitions).sort()) {
    schemas[name] = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `https://Galerina.local/schemas/${kebabCase(name)}.schema.json`,
      title: name,
      ...definitions[name],
      $defs: Object.fromEntries(Object.entries(definitions).filter(([key]) => key !== name))
    };
  }

  return {
    compiler: ast.compiler,
    project: ast.project,
    schemaVersion: "https://json-schema.org/draft/2020-12/schema",
    schemaCount: Object.keys(schemas).length,
    schemas
  };
}

function objectTypeToSchema(type) {
  const properties = {};
  const required = [];

  for (const field of type.fields || []) {
    properties[field.name] = typeRefToSchema(field.type);
    if (!isOptionType(field.type)) {
      required.push(field.name);
    }
  }

  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
    "x-Galerina-kind": "type"
  };
}

function typeRefToSchema(typeRef) {
  const parsed = parseTypeRef(typeRef);
  if (!parsed) return {};

  if (/^\d+$/.test(parsed.name)) {
    return { const: Number(parsed.name), "x-Galerina-kind": "shape-dimension" };
  }

  switch (parsed.name) {
    case "String":
    case "Email":
      return { type: "string" };
    case "SecureString":
      return { type: "string", writeOnly: true, "x-Galerina-secure": true };
    case "Int":
    case "Int8":
    case "Int16":
    case "Int32":
    case "Int64":
    case "UInt8":
    case "UInt16":
    case "UInt32":
    case "UInt64":
      return { type: "integer" };
    case "Float":
    case "Float16":
    case "Float32":
    case "Float64":
    case "Decimal":
      return { type: "number" };
    case "Bool":
      return { type: "boolean" };
    case "Bytes":
      return { type: "string", contentEncoding: "base64" };
    case "Timestamp":
      return { type: "string", format: "date-time" };
    case "Duration":
      return { type: "string", pattern: "^[0-9]+(ms|s|m|h|d)$" };
    case "Json":
      return true;
    case "JsonObject":
      return { type: "object" };
    case "JsonArray":
      return { type: "array" };
    case "JsonString":
      return { type: "string" };
    case "JsonNumber":
      return { type: "number" };
    case "JsonBool":
      return { type: "boolean" };
    case "JsonNull":
      return { type: "null" };
    case "Option":
      return {
        anyOf: [typeRefToSchema(parsed.args[0] || "Json"), { type: "null" }],
        "x-Galerina-option": true
      };
    case "Array":
    case "Set":
    case "Channel":
      return {
        type: "array",
        items: typeRefToSchema(parsed.args[0] || "Json"),
        "x-Galerina-collection": parsed.name
      };
    case "Map":
      return {
        type: "object",
        additionalProperties: typeRefToSchema(parsed.args[1] || "Json"),
        "x-Galerina-key-type": parsed.args[0] || "String"
      };
    case "Money":
      return {
        type: "object",
        required: ["amount", "currency"],
        additionalProperties: false,
        properties: {
          amount: { type: "string", pattern: "^-?[0-9]+(\\.[0-9]+)?$" },
          currency: parsed.args[0] ? { const: parsed.args[0] } : { type: "string" }
        },
        "x-Galerina-type": typeRef
      };
    case "Vector":
    case "Matrix":
    case "Tensor":
      return {
        type: "array",
        items: { type: "number" },
        "x-Galerina-type": typeRef,
        "x-galerina-target": "compute"
      };
    case "Void":
      return { type: "null" };
    default:
      return { $ref: `#/$defs/${parsed.name}` };
  }
}

function parseTypeRef(typeRef) {
  const text = String(typeRef || "").trim();
  if (!text) return null;
  const genericStart = text.indexOf("<");
  if (genericStart === -1) {
    return { name: text.replace(/[^A-Za-z0-9_].*$/, ""), args: [] };
  }
  const name = text.slice(0, genericStart).trim();
  const genericEnd = findMatchingAngle(text, genericStart);
  const argsText = genericEnd === -1 ? text.slice(genericStart + 1) : text.slice(genericStart + 1, genericEnd);
  return { name, args: splitTopLevel(argsText) };
}

function splitTopLevel(text) {
  const output = [];
  let current = "";
  let depth = 0;
  for (const char of text) {
    if (char === "<") depth += 1;
    if (char === ">") depth -= 1;
    if (char === "," && depth === 0) {
      output.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) output.push(current.trim());
  return output;
}

function findMatchingAngle(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "<") depth += 1;
    if (text[i] === ">") depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function isOptionType(typeRef) {
  const parsed = parseTypeRef(typeRef);
  return parsed && parsed.name === "Option";
}

function cleanCaseName(value) {
  return value.trim().replace(/\(.+$/, "").replace(/[^A-Za-z0-9_].*$/, "");
}

function kebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

module.exports = {
  buildJsonSchemaReport
};
