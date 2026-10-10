import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = join(root, 'examples/auth-service/routeDispatcherService.fungi');
const source = readFileSync(sourcePath, 'utf8');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.toUpperCase().startsWith('GIT_') && !['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())));
function check(path) {
  const result = spawnSync(process.execPath, [join(root, 'galerina.mjs'), 'check', path, '--strict-types', '--strict-governance'],
    { cwd: root, env, encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  return { status: result.status, output: result.stdout + result.stderr };
}

test('auth route dispatcher passes the real strict CLI with its named decision record', () => {
  const result = check(sourcePath);
  assert.equal(result.status, 0, result.output);
  assert.match(source, /type RouteResult = Result<RouteDispatchResponse, String>/);
  assert.match(source, /"\/auth\/verify" => \{ return "verifyPassword" \}/);
});

test('strict route checking rejects the old generic Response and a wrongly typed phase', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'auth-route-dispatch-'));
  assert.equal(dirname(realpathSync(temporary)), realpathSync(tmpdir()));
  try {
    const path = join(temporary, 'routeDispatcherService.fungi');
    for (const [before, after] of [
      ['type RouteResult = Result<RouteDispatchResponse, String>', 'type RouteResult = Result<Response, String>'],
      ['    phase: 54', '    phase: "54"'],
    ]) {
      assert.equal(source.split(before).length, 2, 'unique mutation target');
      writeFileSync(path, source.replace(before, after));
      const result = check(path);
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /FUNGI-TYPE-\d{3}/);
      assert.doesNotMatch(result.output, /FUNGI-PARSE-|ERR_MODULE_NOT_FOUND/);
    }
  } finally {
    assert.equal(dirname(realpathSync(temporary)), realpathSync(tmpdir()));
    assert.ok(temporary.startsWith(join(tmpdir(), 'auth-route-dispatch-')));
    rmSync(temporary, { recursive: true });
  }
});
