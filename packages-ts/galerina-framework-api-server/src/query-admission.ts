/**
 * Query admission for the API-server adapter: one decoded value per decoded name.
 *
 * `URLSearchParams` keeps every occurrence of a repeated name, but the canonical
 * `GalerinaKernelRequest.query` is a flat `Record<string, string>`. Copying entries into
 * that record one by one silently keeps only the LAST value, so `?version=a&version=b`
 * reached the kernel as `version: "b"` with no signal. That is an ambiguity at the toxic
 * border: different consumers (caches, proxies, logs, the kernel) can disagree on which
 * occurrence "is" the value.
 *
 * Fail-closed default: a request target whose query repeats a decoded name is refused
 * before the kernel (or any webhook/replay gate) sees it. Names compare AFTER
 * percent-decoding, so `version=a&%76ersion=b` is the same repeated name. An empty name
 * counts as a name. Refusals never carry the offending name or value.
 *
 * There is no per-route multi-value opt-in yet: query normalisation runs before the App
 * Kernel matches a route, and the kernel's request/route types have no multi-value query
 * schema. An intentional multi-value input needs an explicit owner-reviewed schema at the
 * kernel boundary; it must never fall back to silent last-value-wins.
 *
 * Every admitted name becomes an own enumerable data property (including `__proto__`,
 * which plain assignment would silently drop by calling the prototype setter).
 */

/** Thrown when a decoded query name occurs more than once. Message never names the key. */
export class DuplicateQueryKeyError extends Error {
  constructor() {
    super("duplicate query parameter");
    this.name = "DuplicateQueryKeyError";
  }
}

/**
 * Snapshot decoded query pairs into a flat record, refusing any repeated decoded name.
 * Throws `DuplicateQueryKeyError` on the first repeat; never returns a partial record.
 */
export function admitQueryOnce(
  pairs: Iterable<readonly [string, string]>,
): Record<string, string> {
  const query: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [name, value] of pairs) {
    if (seen.has(name)) throw new DuplicateQueryKeyError();
    seen.add(name);
    Object.defineProperty(query, name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return query;
}