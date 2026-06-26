import { readFile } from "node:fs/promises";
import type { TaskDefinition } from "./types.js";

export interface LoadedTasks {
  readonly path: string;
  readonly tasks: readonly TaskDefinition[];
}

export async function loadTasks(path: string): Promise<LoadedTasks> {
  const source = await readFile(path, "utf8");

  return {
    path,
    tasks: parseTasksSource(source)
  };
}

export function parseTasksSource(source: string): readonly TaskDefinition[] {
  return extractTaskBlocks(source).map(parseTaskBlock);
}

interface TaskBlock {
  readonly name: string;
  readonly body: string;
}

function extractTaskBlocks(source: string): readonly TaskBlock[] {
  const blocks: TaskBlock[] = [];
  let index = 0;

  while (index < source.length) {
    const match = /\btask\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{/g.exec(source.slice(index));
    if (match === null) {
      break;
    }

    const name = match[1];
    const openBraceIndex = index + match.index + match[0].lastIndexOf("{");
    const closeBraceIndex = findMatchingBrace(source, openBraceIndex);

    if (name === undefined || closeBraceIndex === undefined) {
      break;
    }

    blocks.push({
      name,
      body: source.slice(openBraceIndex + 1, closeBraceIndex)
    });
    index = closeBraceIndex + 1;
  }

  return blocks;
}

function parseTaskBlock(block: TaskBlock): TaskDefinition {
  const unsafe = /\bunsafe\b/.test(removeNestedBlocks(block.body, ["run", "permissions"]));
  const reason = readStringProperty(block.body, "reason");
  const description = readStringProperty(block.body, "description");
  const timeoutMs = readNumberProperty(block.body, "timeoutMs") ?? readNumberProperty(block.body, "timeout");

  return {
    name: block.name,
    ...(description === undefined ? {} : { description }),
    ...(unsafe ? { unsafe: true } : {}),
    ...(reason === undefined ? {} : { reason }),
    depends: readListProperty(block.body, "depends"),
    effects: readEffects(block.body),
    permissions: readPermissions(block.body),
    ...(timeoutMs === undefined ? {} : { timeoutMs })
  };
}

function findMatchingBrace(source: string, openBraceIndex: number): number | undefined {
  let depth = 0;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

function readEffects(body: string): TaskDefinition["effects"] {
  return readListProperty(body, "effects").filter(isTaskEffect);
}

function readListProperty(body: string, name: string): readonly string[] {
  const match = new RegExp(`\\b${name}\\s*\\[([^\\]]*)\\]`).exec(body);
  const rawItems = match?.[1];

  if (rawItems === undefined) {
    return [];
  }

  return rawItems
    .split(",")
    .flatMap((item) => item.trim().split(/\s+/))
    .map((item) => item.replace(/^["']|["']$/g, "").trim())
    .filter((item) => item.length > 0);
}

function readStringProperty(body: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s+"([^"]*)"`).exec(body);
  const value = match?.[1]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readNumberProperty(body: string, name: string): number | undefined {
  const match = new RegExp(`\\b${name}\\s+([0-9]+)`).exec(body);
  const value = match?.[1];
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

function readPermissions(body: string): TaskDefinition["permissions"] {
  const block = readNamedBlock(body, "permissions");

  if (block === undefined) {
    return [];
  }

  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map(readPermissionLine)
    .filter((permission): permission is TaskDefinition["permissions"][number] => permission !== undefined);
}

function readPermissionLine(line: string): TaskDefinition["permissions"][number] | undefined {
  const match = /^(read|write|network|environment|database|shell)\s+(.+)$/.exec(line);
  const kind = match?.[1];
  const rawValues = match?.[2];

  if (kind === undefined || rawValues === undefined) {
    return undefined;
  }

  const values = [...rawValues.matchAll(/"([^"]+)"/g)]
    .map((valueMatch) => valueMatch[1])
    .filter((value): value is string => value !== undefined);

  return {
    kind: kind as TaskDefinition["permissions"][number]["kind"],
    values
  };
}

function readNamedBlock(body: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*\\{`).exec(body);

  if (match === null) {
    return undefined;
  }

  const openBraceIndex = match.index + match[0].lastIndexOf("{");
  const closeBraceIndex = findMatchingBrace(body, openBraceIndex);

  return closeBraceIndex === undefined
    ? undefined
    : body.slice(openBraceIndex + 1, closeBraceIndex);
}

function removeNestedBlocks(body: string, names: readonly string[]): string {
  let output = body;

  for (const name of names) {
    const block = readNamedBlock(output, name);
    if (block !== undefined) {
      output = output.replace(block, "");
    }
  }

  return output;
}

function isTaskEffect(value: string): value is TaskDefinition["effects"][number] {
  return [
    "filesystem",
    "network",
    "database",
    "environment",
    "shell",
    "compiler",
    "reports",
    "crypto"
  ].includes(value);
}
