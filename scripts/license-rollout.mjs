#!/usr/bin/env node
// license-rollout.mjs — RD-0355 L1/L2/L7 (owner-confirmed 2026-07-11: Apache-2.0, attribution
// "Copyright (C) 2026 TritHypha"). The repo ships under Apache-2.0 (root LICENSE + 87/94 package
// fields + the open-core lint audit-tier-boundary.mjs) — the handover's "MIT" premise was wrong for
// THIS repo, so this rolls out Apache-2.0, NOT MIT. This COMPLETES license-file coverage; it is not
// a relicense.
//
//   L1  — an Apache-2.0 LICENSE (short-pointer form, matching the repo's per-package convention) into
//         every packages-galerina/* that lacks one, EXCEPT ext-proof-snarkjs.
//   L2  — ext-proof-snarkjs is a combined work with snarkjs (GPL-3.0): LICENSE = the official GPLv3
//         application notice (verbatim-safe, references gnu.org; the full text ships in snarkjs's tree
//         and at gnu.org), license field = GPL-3.0-only, + an opt-in README banner. The ONE deliberate
//         non-Apache exception (contained; no @galerina/* depends on it — audit-license-compat.mjs).
//   L7  — set "license" in the packages that lack the field: Apache-2.0 (or GPL-3.0-only for the ext).
//
// Read-only unless --apply. Default = --dry-run (print the plan). Never touches an existing LICENSE
// file (the 5 present are left as-is; a Galerina-authors vs TritHypha attribution nit is flagged, not
// churned). Zero-dep. Run from repo root.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const PKGS = join(ROOT, "packages-galerina");
const EXT_GPL = "galerina-ext-proof-snarkjs";   // the one GPL combined-work extension
const COPYRIGHT = "Copyright (C) 2026 TritHypha";

const APACHE_LICENSE = `${COPYRIGHT}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`;

const GPL_LICENSE = `${COPYRIGHT}

@galerina/ext-proof-snarkjs is an OPTIONAL, non-core extension. It links snarkjs
(GPL-3.0) in-process, so the combined work is licensed under the GNU General Public
License, version 3.

This program is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software Foundation,
version 3.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this
program. If not, see <https://www.gnu.org/licenses/>.

--------------------------------------------------------------------------------
NOTICE: importing this package places your distributed work under GPL-3.0
obligations — opt in knowingly. No other @galerina/* package depends on it
(enforced by scripts/audit-license-compat.mjs). This is the ONE deliberate
non-Apache exception in the workspace (RD-0355 L2).
`;

const README_BANNER = `> ⚠️ **GPL-3.0 optional extension.** This package links snarkjs (GPL-3.0) in-process, so it is
> licensed **GPL-3.0-only** — importing it places your distributed work under GPL-3.0 obligations.
> Opt in knowingly. It is a non-core, opt-in extension; no other \`@galerina/*\` package depends on it.

`;

// Insert a "license" field into a package.json string with a minimal diff (after "version", else
// after "name"). Returns the new string, or null if a field already exists / no anchor found.
function insertLicenseField(raw, value) {
  if (/"license"\s*:/.test(raw)) return null;
  const line = `  "license": ${JSON.stringify(value)},`;
  let m = raw.match(/(\n[ \t]*"version"\s*:\s*"[^"]*",?)/);
  if (!m) m = raw.match(/(\n[ \t]*"name"\s*:\s*"[^"]*",?)/);
  if (!m) return null;
  const anchor = m[1].replace(/,?$/, ",");            // ensure the anchor line ends with a comma
  return raw.replace(m[1], anchor + "\n" + line);
}

const plan = { apacheLicense: [], gplLicense: [], apacheField: [], gplField: [], readmeBanner: [], skipped: [] };

for (const pkg of readdirSync(PKGS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const dir = join(PKGS, pkg);
  const isExt = pkg === EXT_GPL;
  const licPath = join(dir, "LICENSE");
  const pjPath = join(dir, "package.json");

  // ── LICENSE file ──
  if (existsSync(licPath)) {
    plan.skipped.push(`${pkg}: LICENSE already present (left as-is)`);
  } else if (isExt) {
    plan.gplLicense.push(pkg);
    if (APPLY) writeFileSync(licPath, GPL_LICENSE);
  } else {
    plan.apacheLicense.push(pkg);
    if (APPLY) writeFileSync(licPath, APACHE_LICENSE);
  }

  // ── license field ──
  if (existsSync(pjPath)) {
    const raw = readFileSync(pjPath, "utf8");
    const value = isExt ? "GPL-3.0-only" : "Apache-2.0";
    const next = insertLicenseField(raw, value);
    if (next !== null) {
      (isExt ? plan.gplField : plan.apacheField).push(pkg);
      if (APPLY) writeFileSync(pjPath, next);
    }
  }

  // ── README banner (ext only) ──
  if (isExt) {
    const readmePath = join(dir, "README.md");
    if (existsSync(readmePath)) {
      const rm = readFileSync(readmePath, "utf8");
      if (!rm.includes("GPL-3.0 optional extension")) {
        plan.readmeBanner.push(pkg);
        if (APPLY) writeFileSync(readmePath, README_BANNER + rm);
      }
    }
  }
}

const n = (a) => a.length;
console.log(`# license-rollout (RD-0355 L1/L2/L7) — ${APPLY ? "APPLY" : "DRY-RUN"} — Apache-2.0, ${COPYRIGHT}`);
console.log(`Apache-2.0 LICENSE to write: ${n(plan.apacheLicense)}`);
console.log(`GPL-3.0 LICENSE to write:    ${n(plan.gplLicense)}  (${plan.gplLicense.join(", ")})`);
console.log(`Apache-2.0 field to set:     ${n(plan.apacheField)}  (${plan.apacheField.join(", ")})`);
console.log(`GPL-3.0-only field to set:   ${n(plan.gplField)}  (${plan.gplField.join(", ")})`);
console.log(`README GPL banner:           ${n(plan.readmeBanner)}  (${plan.readmeBanner.join(", ")})`);
console.log(`LICENSE already present (skipped): ${n(plan.skipped)}`);
for (const s of plan.skipped) console.log(`  · ${s}`);
if (!APPLY) console.log(`\n(dry-run — re-run with --apply to write. ${n(plan.apacheLicense) + n(plan.gplLicense)} LICENSE files + ${n(plan.apacheField) + n(plan.gplField)} fields + ${n(plan.readmeBanner)} banner.)`);
