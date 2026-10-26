// ENV-ANCHOR-BETA host shim (RD-1413 critical path; gcw-k3u109, 2026-10-26). NON_AUTHORIZING until merged.
// Beta secrets (Phillip 2026-10-25 14:06 GMT): ONE plain deployment .env, read ONCE at startup, exposed only
// through the SecretsProvider port shape (has / use / revocationEpoch). .env.spore is post-beta.
// This file only turns bytes into Int facts and holds the decoded values. Every admit/refuse decision is the
// return code of the native flows envFileAdmit, envKeyAdmit, envAadAdmit and envSecretAccess, taken from ONE
// pinned WebAssembly build of packages/fungi/memory/src/{c-boundary,release-commit-point,secrets-provider-port,
// env-anchor-beta}.fungi (host/env-anchor-beta.wasm), sha256-verified and instantiated with no imports.
// Zero-trust choices (rejected options in ENVANCHOR-redtest-plan-469e6f49-20261025.md, k3u108/k3u109 addenda):
//  - no ambient environment source and no command-line source: argv arrives as data and any manifest name in it
//    refuses 182 before the file is touched (rejected: fall back to the ambient environment for a missing key).
//  - the manifest is exactly { name, hexBytes } per entry; any other field (a default) refuses 111.
//  - the worse of the caller's typed mode and this shim's own lstat wins; a non-regular file or a link refuses.
//  - undeclared key NAMES are never echoed (a mistyped line could put a value in the name position).
//  - errors carry { code, key, rule } only, never a value, a prefix or a line; the file buffer is zeroed.
//  - a fault (probe true OR probe throws) latches for the process lifetime and advances the epoch once.
//  - any return code outside the closed set refuses 111 (rejected: trust the asset's range).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENV_ANCHOR_BETA_WASM_SHA256 = "f87b2ad4924db3bddee0c7b6f2ccd7ccbafd68e4d81e0cf226638f7197d5b1c4";
const ASSET = join(dirname(fileURLToPath(import.meta.url)), "env-anchor-beta.wasm");
const FLOWS = Object.freeze(["envFileAdmit", "envKeyAdmit", "envAadAdmit", "envSecretAccess"]);
const RULES = Object.freeze({
  100: "admit", 110: "foreign_raw", 111: "unlisted", 112: "undeclared", 119: "provider_absent",
  175: "missing", 176: "empty", 177: "malformed", 178: "duplicate", 179: "unknown_key",
  180: "mode_open", 181: "mode_unknown", 182: "argv_source", 183: "aad_mismatch", 184: "provider_faulted",
});
const FILE_CAP = 65536;
const AUDIT_CAP = 1024;
const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const LINE_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const OPTION_KEYS = Object.freeze(["argv", "envPath", "faultProbe", "manifest", "modeClass"]);

export class EnvAnchorRefused extends Error {
  constructor(code, key, rule) {
    super("EnvAnchorRefused " + String(code) + " " + String(rule));
    this.code = code;
    this.key = key;
    this.rule = rule;
    Object.freeze(this);
  }
}
EnvAnchorRefused.prototype.name = "EnvAnchorRefused";

function refuse(code, key) {
  const c = Object.prototype.hasOwnProperty.call(RULES, code) && code !== 100 ? code : 111;
  throw new EnvAnchorRefused(c, typeof key === "string" ? key : "", RULES[c]);
}

let NATIVE = null;
function native() {
  if (NATIVE !== null) {
    return NATIVE;
  }
  const bytes = new Uint8Array(readFileSync(ASSET));
  if (createHash("sha256").update(bytes).digest("hex") !== ENV_ANCHOR_BETA_WASM_SHA256) {
    refuse(111, "");
  }
  const mod = new WebAssembly.Module(bytes);
  if (WebAssembly.Module.imports(mod).length !== 0) {
    refuse(111, "");
  }
  const x = new WebAssembly.Instance(mod, {}).exports;
  for (const f of FLOWS) {
    if (typeof x[f] !== "function") {
      refuse(111, "");
    }
  }
  NATIVE = Object.freeze({ envFileAdmit: x.envFileAdmit, envKeyAdmit: x.envKeyAdmit, envAadAdmit: x.envAadAdmit, envSecretAccess: x.envSecretAccess });
  return NATIVE;
}

// Every input is a bounded Int tagged class 0; anything else is passed through so the native flow refuses it.
function decide(flow, args) {
  const v = native()[flow](...args.map((a) => (Number.isSafeInteger(a) ? a : -1)));
  return Object.prototype.hasOwnProperty.call(RULES, v) ? v : 111;
}

function checkOptions(opts) {
  if (opts === null || typeof opts !== "object" || Array.isArray(opts)) refuse(111, "");
  const keys = Object.keys(opts).sort();
  if (keys.length !== OPTION_KEYS.length || keys.some((k, i) => k !== OPTION_KEYS[i])) refuse(111, "");
  if (typeof opts.envPath !== "string" || opts.envPath.length === 0) refuse(111, "");
  if (!Array.isArray(opts.argv) || opts.argv.some((a) => typeof a !== "string")) refuse(111, "");
  if (!Number.isSafeInteger(opts.modeClass)) refuse(111, "");
  if (typeof opts.faultProbe !== "function") refuse(111, "");
  const m = opts.manifest;
  if (!Array.isArray(m) || m.length === 0 || m.length > 256) refuse(111, "");
  const names = new Set();
  const out = [];
  for (const e of m) {
    if (e === null || typeof e !== "object") refuse(111, "");
    const ek = Object.keys(e).sort();
    if (ek.length !== 2 || ek[0] !== "hexBytes" || ek[1] !== "name") refuse(111, "");
    if (typeof e.name !== "string" || NAME_RE.test(e.name) !== true || names.has(e.name)) refuse(111, "");
    if (!Number.isSafeInteger(e.hexBytes) || e.hexBytes < 1 || e.hexBytes > 4096) refuse(111, "");
    names.add(e.name);
    out.push(Object.freeze({ name: e.name, hexBytes: e.hexBytes }));
  }
  return Object.freeze(out);
}

// 0 owner-only, 1 group/world-readable, 2 UNKNOWN. Worse of caller and own lstat wins.
function ownMode(path) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return 2;
  }
  if (st.isFile() !== true) return 2;
  if ((st.mode & 0o077) !== 0) return 1;
  return 0;
}

function worseMode(caller, own) {
  if (caller !== 0 && caller !== 1 && caller !== 2) return caller;
  if (caller === 1 || own === 1) return 1;
  if (caller === 2 || own === 2) return 2;
  return 0;
}

export async function loadEnvAnchorBeta(opts) {
  const manifest = checkOptions(opts);
  native();
  const declared = new Set(manifest.map((e) => e.name));
  // Command-line source first: any declared name in argv refuses 182 before the file is examined.
  const fromArgv = opts.argv.some((a) => manifest.some((e) => a.includes(e.name))) ? 1 : 0;
  if (fromArgv === 1) {
    refuse(decide("envFileAdmit", [0, 1, 0, opts.modeClass, 0, 0]), "");
  }
  const mode = worseMode(opts.modeClass, ownMode(opts.envPath));
  if (mode !== 0) {
    refuse(decide("envFileAdmit", [0, 0, 0, mode, 0, 0]), "");
  }
  let buf;
  try {
    buf = readFileSync(opts.envPath);
  } catch {
    refuse(decide("envFileAdmit", [0, 0, 0, 2, 0, 0]), "");
  }
  const occ = new Map();
  let unknownCount = 0;
  let structural = false;
  try {
    if (buf.length > FILE_CAP) {
      structural = true;
    } else {
      let text = "";
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        structural = true;
      }
      for (const raw of structural ? [] : text.split("\n")) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        if (line.length === 0 || line.startsWith("#")) continue;
        const m = LINE_RE.exec(line);
        if (m === null) {
          structural = true;
          break;
        }
        if (!declared.has(m[1])) {
          unknownCount = unknownCount + 1;
          continue;
        }
        const list = occ.get(m[1]) || [];
        list.push(m[2]);
        occ.set(m[1], list);
      }
    }
  } finally {
    buf.fill(0);
  }
  if (structural) {
    refuse(111, "");
  }
  const fileVerdict = decide("envFileAdmit", [0, 0, 0, 0, 0, unknownCount]);
  if (fileVerdict !== 100) {
    refuse(fileVerdict, "");
  }
  const values = new Map();
  for (const e of manifest) {
    const list = occ.get(e.name) || [];
    const v = list.length === 1 ? list[0] : "";
    const empty = list.length === 1 && v.length === 0 ? 1 : 0;
    const formatOk = list.length === 1 && v.length === e.hexBytes * 2 && /^[0-9A-Fa-f]+$/.test(v) ? 1 : 0;
    const verdict = decide("envKeyAdmit", [0, list.length, 0, empty, 0, formatOk]);
    if (verdict !== 100) {
      for (const b of values.values()) b.fill(0);
      refuse(verdict, e.name);
    }
    values.set(e.name, Uint8Array.from(Buffer.from(v, "hex")));
  }
  occ.clear();
  return buildProvider(values, opts.faultProbe);
}

// AEAD additional data must bind purpose AND root (EA-R10). The wrap path calls this before sealing.
export function admitAad(purposeMatch, rootMatch) {
  const verdict = decide("envAadAdmit", [0, purposeMatch, 0, rootMatch]);
  if (verdict !== 100) refuse(verdict, "");
  return true;
}

// EA-R10 AEAD binding (gcw-k3u110). AAD = tag 0x00 u32be(len purpose) purpose u32be(len root) root: length-prefixed
// so no two (purpose, root) pairs share an AAD. AES-256-GCM, fresh random 12-byte nonce per seal, 16-byte tag pinned.
// Key 32 bytes, nonce 12, tag 16, purpose/root in a closed lower-case alphabet; anything else refuses 111.
// A GCM failure on open (other purpose, other root, any touched byte) is mapped by the native envAadAdmit flow (183).
const AAD_TAG = "galerina.env-anchor-beta.aad.v1";
const BIND_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

function bytesOf(x, n) {
  if (!(x instanceof Uint8Array) || (n !== undefined && x.length !== n)) refuse(111, "");
  return x;
}

function bindingOf(v) {
  if (typeof v !== "string" || BIND_RE.test(v) !== true) refuse(111, "");
  return Buffer.from(v, "utf8");
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

export function boundAad(purpose, rootId) {
  const p = bindingOf(purpose);
  const r = bindingOf(rootId);
  return new Uint8Array(Buffer.concat([Buffer.from(AAD_TAG, "utf8"), Buffer.from([0]), u32(p.length), p, u32(r.length), r]));
}

export function sealBound(key, purpose, rootId, plaintext) {
  bytesOf(key, 32);
  bytesOf(plaintext);
  const aad = boundAad(purpose, rootId);
  admitAad(1, 1);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Object.freeze({ iv: new Uint8Array(iv), ct: new Uint8Array(ct), tag: new Uint8Array(c.getAuthTag()) });
}

export function openBound(key, purpose, rootId, sealed) {
  bytesOf(key, 32);
  if (sealed === null || typeof sealed !== "object" || Array.isArray(sealed)) refuse(111, "");
  const ks = Object.keys(sealed).sort();
  if (ks.length !== 3 || ks[0] !== "ct" || ks[1] !== "iv" || ks[2] !== "tag") refuse(111, "");
  bytesOf(sealed.iv, 12);
  bytesOf(sealed.tag, 16);
  bytesOf(sealed.ct);
  const aad = boundAad(purpose, rootId);
  let out = null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, sealed.iv, { authTagLength: 16 });
    d.setAAD(aad);
    d.setAuthTag(sealed.tag);
    out = Buffer.concat([d.update(sealed.ct), d.final()]);
  } catch {
    out = null;
  }
  const ok = out === null ? 0 : 1;
  try {
    admitAad(ok, ok);
  } catch (e) {
    if (out !== null) out.fill(0);
    throw e;
  }
  const view = new Uint8Array(out);
  out.fill(0);
  return view;
}

function buildProvider(values, faultProbe) {
  let latched = false;
  let present = true;
  let epoch = 0;
  const audit = [];
  let dropped = 0;
  function note(ev) {
    if (audit.length < AUDIT_CAP) audit.push(Object.freeze(ev));
    else dropped = dropped + 1;
  }
  function probe() {
    let f = true;
    try {
      f = faultProbe() !== false;
    } catch {
      f = true;
    }
    if (f && !latched) {
      latched = true;
      epoch = epoch + 1;
      for (const b of values.values()) b.fill(0);
      note({ event: "fault_latched", epoch });
    }
  }
  function verdict(name) {
    probe();
    const declared = typeof name === "string" && values.has(name) ? 1 : 0;
    return decide("envSecretAccess", [0, latched ? 1 : 0, 0, declared, 0, present ? 1 : 0]);
  }
  note({ event: "boot_admit", keys: values.size, epoch });
  const provider = Object.freeze({
    has(name) {
      return verdict(name) === 100;
    },
    use(name, fn) {
      const v = verdict(name);
      note({ event: "use", verdict: v });
      if (v !== 100 || typeof fn !== "function") return;
      const view = Uint8Array.from(values.get(name));
      try {
        fn(view);
      } finally {
        view.fill(0);
      }
    },
    revocationEpoch() {
      probe();
      return epoch;
    },
    dispose() {
      if (present) {
        present = false;
        epoch = epoch + 1;
        for (const b of values.values()) b.fill(0);
        note({ event: "disposed", epoch });
      }
    },
  });
  return Object.freeze({
    provider,
    auditEvents() {
      return Object.freeze(audit.slice().concat(dropped > 0 ? [Object.freeze({ event: "audit_dropped", count: dropped })] : []));
    },
  });
}