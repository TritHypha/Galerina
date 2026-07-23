/**
 * governance/crypto-suites.mjs — the crypto-suite register reader (crypto-agility, part 1).
 *
 * Zero-trust: the register names every signature SUITE Galerina knows about, its status,
 * and the signer + verifier bound to it. The version-dispatch verifier (part 2) and the
 * conformance gate (part 3) both read the SAME list from here — no suite is signable or
 * verifiable unless it is written down.
 *
 * Source of truth: governance/crypto-suites.json (a mirror of the authoritative register).
 *
 * Fail-closed everywhere:
 *   - A missing or malformed register THROWS (a dispatcher with no register cannot decide
 *     safely — unlike revocations.json, an absent crypto-suite register is a misconfiguration,
 *     not a benign "nothing to enforce").
 *   - An unknown suite (or unknown domain) is NOT signable and NOT verifiable — the predicates
 *     deny on any miss, they never throw on an untrusted suite id.
 *   - Only status "active-for-signing" may sign. "open-decision" and "planned" may NOT sign
 *     (open-decision is a policy hold; planned has no signer). This is the security primitive:
 *     the signer refuses any suite that is not the active production suite.
 *   - The iron rule: a "verify-only-retired" suite KEEPS its verifier, so it stays verifiable.
 *     isSuiteVerifiable() keys off "does a verifier symbol exist", never off signable status.
 *
 * Envelope scope: THREE domain-separated families (governance-signature, audit-attestation,
 * bridge-manifest). Dispatch happens WITHIN a domain — callers pass the domain id explicitly.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The closed status vocabulary. A suite whose status is outside this set is a config error. */
export const SUITE_STATUSES = Object.freeze([
  "active-for-signing",
  "verify-only-retired",
  "open-decision",
  "planned",
]);

function registerPath(rootDir) {
  return join(rootDir, "governance", "crypto-suites.json");
}

/**
 * Structurally validate a parsed register object (pure — no I/O). Throws on any schema
 * violation, returns the same object on success. Exposed so the fail-closed paths are
 * unit-testable without writing a temp file to disk.
 */
export function validateCryptoSuites(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.domains)) {
    throw new Error("crypto-suites.json: missing or invalid 'domains' array");
  }
  const seenDomains = new Set();
  for (const domain of data.domains) {
    if (!domain || typeof domain.id !== "string" || domain.id.length === 0) {
      throw new Error("crypto-suites.json: a domain is missing a string 'id'");
    }
    if (seenDomains.has(domain.id)) {
      throw new Error(`crypto-suites.json: duplicate domain id '${domain.id}'`);
    }
    seenDomains.add(domain.id);
    if (!Array.isArray(domain.suites)) {
      throw new Error(`crypto-suites.json: domain '${domain.id}' is missing a 'suites' array`);
    }
    const seenSuites = new Set();
    for (const suite of domain.suites) {
      if (!suite || typeof suite.suiteId !== "string" || suite.suiteId.length === 0) {
        throw new Error(`crypto-suites.json: a suite in domain '${domain.id}' is missing a string 'suiteId'`);
      }
      if (seenSuites.has(suite.suiteId)) {
        throw new Error(`crypto-suites.json: duplicate suiteId '${suite.suiteId}' in domain '${domain.id}'`);
      }
      seenSuites.add(suite.suiteId);
      if (!SUITE_STATUSES.includes(suite.status)) {
        // A typo in status must fail LOUDLY at load, not silently make a suite non-signable.
        throw new Error(`crypto-suites.json: suite '${suite.suiteId}' has invalid status '${suite.status}' (expected one of ${SUITE_STATUSES.join(", ")})`);
      }
      // A planned suite must not claim a signer (it has none yet); enforce that invariant.
      if (suite.status === "planned" && typeof suite.signer === "string" && suite.signer.length > 0) {
        throw new Error(`crypto-suites.json: suite '${suite.suiteId}' is 'planned' but names a signer '${suite.signer}'`);
      }
    }
  }
  return data;
}

/**
 * Load + structurally validate the crypto-suite register.
 * Missing → throws (fail closed). Malformed / schema-violating → throws.
 * Returns the validated register object.
 */
export function loadCryptoSuites(rootDir = ".") {
  const path = registerPath(rootDir);
  if (!existsSync(path)) {
    throw new Error(`crypto-suites.json not found at ${path} — the crypto-suite register is required (fail closed)`);
  }
  const data = JSON.parse(readFileSync(path, "utf-8")); // malformed JSON → throws → caller fails closed
  return validateCryptoSuites(data);
}

/** Internal: find a suite by (domainId, suiteId), or null on any miss (unknown domain OR suite). */
function findSuite(register, domainId, suiteId) {
  const domain = register?.domains?.find((d) => d.id === domainId);
  if (!domain) return null;
  return domain.suites.find((s) => s.suiteId === suiteId) ?? null;
}

/** List the domain ids in the register. */
export function listDomains(register) {
  return register.domains.map((d) => d.id);
}

/** Get a domain by id. Unknown domain → throws (structural navigation; a caller bug, fail loud). */
export function getDomain(register, domainId) {
  const domain = register.domains.find((d) => d.id === domainId);
  if (!domain) {
    throw new Error(`crypto-suite register: unknown domain '${domainId}' (known: ${listDomains(register).join(", ")})`);
  }
  return domain;
}

/** List the suite ids within a domain. Unknown domain → throws. */
export function listSuites(register, domainId) {
  return getDomain(register, domainId).suites.map((s) => s.suiteId);
}

/** Get a suite object by (domainId, suiteId), or null on any miss. */
export function getSuite(register, domainId, suiteId) {
  return findSuite(register, domainId, suiteId);
}

/**
 * May this suite SIGN new artifacts? True ONLY for status "active-for-signing".
 * open-decision / planned / verify-only-retired / unknown → false (fail closed).
 * This is the security primitive the part-2 signer path enforces.
 */
export function isSuiteSignable(register, domainId, suiteId) {
  const suite = findSuite(register, domainId, suiteId);
  return suite !== null && suite.status === "active-for-signing";
}

/**
 * May this suite VERIFY existing artifacts? True when the suite exists and names a verifier.
 * Respects the iron rule: a verify-only-retired suite keeps its verifier → still verifiable.
 * A planned suite (or unknown suite) with no verifier → false (fail closed).
 */
export function isSuiteVerifiable(register, domainId, suiteId) {
  const suite = findSuite(register, domainId, suiteId);
  return suite !== null && typeof suite.verifier === "string" && suite.verifier.length > 0;
}

/** The verifier symbol bound to a suite, or null on any miss / no verifier. */
export function getVerifierSymbol(register, domainId, suiteId) {
  const suite = findSuite(register, domainId, suiteId);
  return suite && typeof suite.verifier === "string" ? suite.verifier : null;
}

/** The signer symbol bound to a suite, or null on any miss / no signer. */
export function getSignerSymbol(register, domainId, suiteId) {
  const suite = findSuite(register, domainId, suiteId);
  return suite && typeof suite.signer === "string" ? suite.signer : null;
}

/** The recorded security findings (part 3 consumes these). */
export function securityFindings(register) {
  return Array.isArray(register.securityFindings) ? register.securityFindings : [];
}

/** The open decisions parked for the owner. */
export function openDecisions(register) {
  return Array.isArray(register.openDecisions) ? register.openDecisions : [];
}
