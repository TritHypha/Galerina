// Test infrastructure only. The AGENTS owner supplies the hashing algorithm;
// this adapter resolves its checkout and executes only the captured pinned bytes.
import { readFileSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute, basename } from 'node:path';
import { release } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HELPER = 'tools/grok-probe/q8-codex-zone-hash.mjs';
// LF-normalized identity of the existing AGENTS owner, inspected 2026-10-10.
const HELPER_SHA256 = 'a48494c233ba18c25d6434676bf0d815cc44eb29eb258c155e83926063f3e6a5';
function readBounded(path, limit) {
  const info = statSync(path);
  if (!info.isFile() || info.size > limit) throw new Error('zone helper: invalid or oversized file');
  const bytes = readFileSync(path);
  if (bytes.length > limit) throw new Error('zone helper: file grew beyond limit');
  return bytes.toString('utf8');
}
function gitPath(value, base) {
  if (process.platform !== 'win32' && /^[A-Za-z]:[\\/]/.test(value)) {
    if (!/microsoft/i.test(release())) throw new Error('zone helper: Windows gitdir requires explicit AGENTS_ROOT on this host');
    return `/mnt/${value[0].toLowerCase()}/${value.slice(3).replaceAll('\\', '/')}`;
  }
  return resolve(base, value);
}

export function resolveZoneAgentsRoot(root, agentsRoot = process.env.AGENTS_ROOT) {
  if (agentsRoot !== undefined) {
    if (typeof agentsRoot !== 'string' || !agentsRoot.trim() || !isAbsolute(agentsRoot)) {
      throw new Error('zone helper: AGENTS_ROOT must be a nonempty absolute path');
    }
    return realpathSync(agentsRoot);
  }
  const checkout = realpathSync(root);
  const marker = join(checkout, '.git');
  let primary = checkout;
  if (!statSync(marker).isDirectory()) {
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(readBounded(marker, 4096));
    if (!match) throw new Error('zone helper: invalid gitdir marker; set AGENTS_ROOT');
    const gitdir = realpathSync(gitPath(match[1], checkout));
    const commonText = readBounded(join(gitdir, 'commondir'), 4096).trim();
    if (!commonText || /[\r\n]/.test(commonText)) throw new Error('zone helper: invalid commondir');
    const common = realpathSync(gitPath(commonText, gitdir));
    if (basename(common) !== '.git') throw new Error('zone helper: nonstandard common directory; set AGENTS_ROOT');
    primary = dirname(common);
  }
  return realpathSync(join(dirname(primary), 'AGENTS'));
}

export function runCodexZoneHashes(root, agentsRoot = process.env.AGENTS_ROOT) {
  const owner = resolveZoneAgentsRoot(root, agentsRoot);
  const source = readBounded(join(owner, HELPER), 16384).replaceAll('\r\n', '\n');
  if (createHash('sha256').update(source).digest('hex') !== HELPER_SHA256) {
    throw new Error('zone helper: owner bytes changed; review before execution');
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.toUpperCase().startsWith('GIT_') && !['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())));
  // stdin executes the checked snapshot, not a path that could change after hashing.
  const child = spawnSync(process.execPath, ['--input-type=module', '-', realpathSync(root)], {
    input: source, encoding: 'utf8', cwd: owner, env,
    timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 65536, windowsHide: true,
  });
  if (child.error || child.signal || child.status !== 0) {
    throw new Error(`zone helper: execution refused (${child.error?.code ?? child.signal ?? child.status}): ${child.stderr ?? ''}`);
  }
  const rows = child.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  if (rows.length !== 3 || rows.some((row, i) => row.ok !== true ||
      typeof row.label !== 'string' || !row.label.startsWith(`Z${i + 1} `) ||
      !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isInteger(row.startLine) ||
      !Number.isInteger(row.endLine) || row.startLine < 1 || row.endLine < row.startLine)) {
    throw new Error('zone helper: malformed result');
  }
  return rows;
}
