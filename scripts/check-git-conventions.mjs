#!/usr/bin/env node
// check-git-conventions.mjs — advisory checker for the Galerina Git policy
// (packages-ts/galerina-core/GIT.md "Current policy" and COMPILED_APP_GIT.md "Current policy").
// NOT wired into CI; wiring it is the owner's choice.
//
// Usage:
//   node scripts/check-git-conventions.mjs --branch <name> [--subject <text>]... [--tag <tag>]...
//   node scripts/check-git-conventions.mjs --from-git [--max <n>]   (current branch + last n subjects, default 20)
// Exit codes: 0 all valid, 1 violations, 2 usage error.

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COMMIT_TYPES = Object.freeze([
  "feat", "fix", "docs", "design", "security", "test", "chore", "refactor", "perf", "build", "ci", "revert", "todo",
]);
export const DEPLOY_ENVS = Object.freeze(["dev", "test", "staging", "production"]);
const MAX_SUBJECT = 100;
const RELEASE = String.raw`v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.(?:0|[1-9]\d*))?`;

function validDate(yyyymmdd) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  if (y < 2000 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function result(ok, reason) {
  return Object.freeze(ok ? { ok: true } : { ok: false, reason });
}

/** `main`, or `<owner>/<topic>-<yyyymmdd>` (owner and topic lowercase kebab). */
export function checkBranchName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 120) return result(false, "branch name must be 1-120 characters");
  if (name === "main") return result(true);
  const m = /^([a-z][a-z0-9-]{0,30})\/([a-z0-9][a-z0-9.-]*)-(\d{8})$/.exec(name);
  if (!m) return result(false, "branch must be <owner>/<topic>-<yyyymmdd> (lowercase, kebab-case)");
  if (m[2].includes("..") || m[2].endsWith(".") || m[2].endsWith("-")) return result(false, "topic has an invalid dot or dash sequence");
  if (!validDate(m[3])) return result(false, "branch date is not a real yyyymmdd date");
  return result(true);
}

/** Conventional Commits subject: `type(scope)!: subject`, at most 100 characters,
 *  no trailing period. GitHub merge subjects are accepted. */
export function checkCommitSubject(subject) {
  if (typeof subject !== "string" || subject.length === 0) return result(false, "subject is empty");
  if (/[\u0000-\u001f\u007f]/.test(subject)) return result(false, "subject contains control characters");
  if (/^Merge (pull request #\d+ from |branch ')/.test(subject)) return result(true);
  if (/^Revert ".+"$/.test(subject)) return result(true);
  if (subject.length > MAX_SUBJECT) return result(false, `subject is longer than ${MAX_SUBJECT} characters`);
  const m = /^([a-z]+)(\([a-z0-9][a-z0-9./-]*\))?(!)?: (\S.*)$/.exec(subject);
  if (!m) return result(false, "subject must be type(scope): description");
  if (!COMMIT_TYPES.includes(m[1])) return result(false, `unknown commit type "${m[1]}"`);
  if (m[4].endsWith(".")) return result(false, "subject must not end with a period");
  return result(true);
}

/** Release `vMAJOR.MINOR.PATCH[-beta.N]`, deploy `deploy/<env>/<yyyymmdd-hhmm>`,
 *  rollback `rollback/<env>/<fromTag>-<toTag>`. */
export function checkTag(tag) {
  if (typeof tag !== "string" || tag.length === 0 || tag.length > 120) return result(false, "tag must be 1-120 characters");
  if (new RegExp(`^${RELEASE}$`).test(tag)) return result(true);
  const deploy = /^deploy\/([a-z]+)\/(\d{8})-(\d{2})(\d{2})$/.exec(tag);
  if (deploy) {
    if (!DEPLOY_ENVS.includes(deploy[1])) return result(false, `unknown deploy environment "${deploy[1]}"`);
    if (!validDate(deploy[2]) || Number(deploy[3]) > 23 || Number(deploy[4]) > 59) return result(false, "deploy tag time is invalid");
    return result(true);
  }
  const rollback = new RegExp(`^rollback/([a-z]+)/(${RELEASE})-(${RELEASE})$`).exec(tag);
  if (rollback) {
    if (!DEPLOY_ENVS.includes(rollback[1])) return result(false, `unknown rollback environment "${rollback[1]}"`);
    if (rollback[2] === rollback[3]) return result(false, "rollback from and to must differ");
    return result(true);
  }
  return result(false, "tag must be a release, deploy/<env>/<yyyymmdd-hhmm> or rollback/<env>/<from>-<to> tag");
}

/** Parse CLI args; returns { error } or { branch, subjects, tags, fromGit, max }. */
export function parseArgs(argv) {
  const out = { branch: "", subjects: [], tags: [], fromGit: false, max: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--from-git") { out.fromGit = true; continue; }
    if (arg === "--branch" || arg === "--subject" || arg === "--tag" || arg === "--max") {
      const value = argv[i + 1];
      if (typeof value !== "string" || value.startsWith("--")) return { error: `${arg} needs a value` };
      i += 1;
      if (arg === "--branch") out.branch = value;
      else if (arg === "--subject") out.subjects.push(value);
      else if (arg === "--tag") out.tags.push(value);
      else {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 500) return { error: "--max must be an integer 1-500" };
        out.max = n;
      }
      continue;
    }
    return { error: `unknown argument ${JSON.stringify(arg).slice(0, 80)}` };
  }
  if (!out.fromGit && out.branch === "" && out.subjects.length === 0 && out.tags.length === 0) return { error: "nothing to check" };
  return out;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", timeout: 15_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }).trim();
}

export function runChecks({ branch, subjects, tags }) {
  const findings = [];
  if (branch !== "") {
    const r = checkBranchName(branch);
    if (!r.ok) findings.push(`branch ${branch}: ${r.reason}`);
  }
  for (const s of subjects) {
    const r = checkCommitSubject(s);
    if (!r.ok) findings.push(`commit "${s.slice(0, 80)}": ${r.reason}`);
  }
  for (const t of tags) {
    const r = checkTag(t);
    if (!r.ok) findings.push(`tag ${t}: ${r.reason}`);
  }
  return findings;
}

function main(argv) {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`check-git-conventions: ${parsed.error}\n`);
    return 2;
  }
  if (parsed.fromGit) {
    parsed.branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    parsed.subjects.push(...git(["log", `-${parsed.max}`, "--format=%s"]).split(/\r?\n/).filter(Boolean));
  }
  const findings = runChecks(parsed);
  for (const f of findings) process.stdout.write(`VIOLATION ${f}\n`);
  process.stdout.write(findings.length === 0 ? "check-git-conventions: OK (advisory; not wired into CI)\n" : `check-git-conventions: ${findings.length} violation(s)\n`);
  return findings.length === 0 ? 0 : 1;
}

const norm = (p) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
if (process.argv[1] && norm(fileURLToPath(import.meta.url)) === norm(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
