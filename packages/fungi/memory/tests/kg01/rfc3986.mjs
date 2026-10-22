/// KG-01 RFC 3986 host-contract oracle. Test glue only. Authority is
/// serve-gate.fungi pathProtection plus evidence/kg01/host-contract.md.

export const TAG_AUTH_VERIFY = 0;
export const TAG_UNNORMALISABLE = 6;
export const TAG_PUBLIC_HELLO = 7;
export const TAG_PUBLIC_FIXTURE = 8;
export const TAG_PUBLIC_OTHER = 9;

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const RESERVED_HEX = { "2F": true, "5C": true, "3F": true, "23": true, "26": true };
const VERSION_KEY = { v: true, object: true, version: true };
const CLOSED = {
  "/auth/verify": TAG_AUTH_VERIFY,
  "/hello": TAG_PUBLIC_HELLO,
  "/fixture": TAG_PUBLIC_FIXTURE,
  "/public": TAG_PUBLIC_OTHER,
};

function refuse() {
  return TAG_UNNORMALISABLE;
}

function splitComponents(input) {
  const hash = input.indexOf("#");
  let rest = input;
  let fragment = "";
  let hasFragment = false;
  if (hash >= 0) {
    fragment = input.slice(hash + 1);
    rest = input.slice(0, hash);
    hasFragment = true;
  }
  const q = rest.indexOf("?");
  let path = rest;
  let query = "";
  let hasQuery = false;
  if (q >= 0) {
    path = rest.slice(0, q);
    query = rest.slice(q + 1);
    hasQuery = true;
  }
  return { path, query, fragment, hasQuery, hasFragment };
}

function percentUnreserved(path) {
  const out = [];
  let i = 0;
  while (i < path.length) {
    const ch = path[i];
    const code = path.charCodeAt(i);
    if (code < 32 || code === 127 || code > 127) {
      return { ok: false, path: "" };
    }
    if (ch === "\\") {
      return { ok: false, path: "" };
    }
    if (ch === "%") {
      if (i + 2 >= path.length) {
        return { ok: false, path: "" };
      }
      const hex = path.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex) !== true) {
        return { ok: false, path: "" };
      }
      const upper = hex.toUpperCase();
      if (RESERVED_HEX[upper] === true) {
        return { ok: false, path: "" };
      }
      const byte = parseInt(upper, 16);
      if (byte === 0 || byte < 32 || byte === 127 || byte > 127) {
        return { ok: false, path: "" };
      }
      const decoded = String.fromCharCode(byte);
      if (UNRESERVED.test(decoded) === true) {
        out.push(decoded);
      } else {
        out.push("%" + upper);
      }
      i = i + 3;
      continue;
    }
    out.push(ch);
    i = i + 1;
  }
  return { ok: true, path: out.join("") };
}

function removeDotSegments(path) {
  if (path.length === 0) {
    return { ok: false, path: "" };
  }
  if (path[0] !== "/") {
    return { ok: false, path: "" };
  }
  const trailingSlash = path.length > 1 && path.endsWith("/");
  const parts = path.split("/");
  const out = [];
  let i = 1;
  while (i < parts.length) {
    const seg = parts[i];
    const isLast = i === parts.length - 1;
    if (seg === "" && isLast === true) {
      i = i + 1;
      continue;
    }
    if (seg === "") {
      return { ok: false, path: "" };
    }
    if (seg === ".") {
      i = i + 1;
      continue;
    }
    if (seg === "..") {
      if (out.length === 0) {
        return { ok: false, path: "" };
      }
      out.pop();
      i = i + 1;
      continue;
    }
    out.push(seg);
    i = i + 1;
  }
  let joined = "/" + out.join("/");
  if (trailingSlash === true) {
    if (joined.endsWith("/") !== true) {
      joined = joined + "/";
    }
  }
  if (joined === "//") {
    joined = "/";
  }
  return { ok: true, path: joined };
}

function queryRefuses(query, hasQuery) {
  if (hasQuery !== true) {
    return false;
  }
  const seen = {};
  const pairs = query.split("&");
  let i = 0;
  while (i < pairs.length) {
    const pair = pairs[i];
    const eq = pair.indexOf("=");
    let key = pair;
    if (eq >= 0) {
      key = pair.slice(0, eq);
    }
    if (VERSION_KEY[key] === true) {
      if (seen[key] === true) {
        return true;
      }
      seen[key] = true;
    }
    i = i + 1;
  }
  return false;
}

export function classifyPath(input) {
  if (typeof input !== "string") {
    return refuse();
  }
  const parts = splitComponents(input);
  if (parts.hasFragment === true) {
    return refuse();
  }
  if (queryRefuses(parts.query, parts.hasQuery) === true) {
    return refuse();
  }
  const decoded = percentUnreserved(parts.path);
  if (decoded.ok !== true) {
    return refuse();
  }
  const dots = removeDotSegments(decoded.path);
  if (dots.ok !== true) {
    return refuse();
  }
  const listed = CLOSED[dots.path];
  if (listed === undefined) {
    return refuse();
  }
  return listed;
}
