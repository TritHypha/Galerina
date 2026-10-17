/**
 * Dependency-free foreign-value boundary. No node: imports.
 * Null/NaN/Infinity/non-number become a typed refusal here and never travel past this module.
 */

export type ForeignNumberRead =
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "refused" };

/** One reusable boundary helper: null/NaN/Infinity/non-number become a typed refusal. */
export function readForeignSafeInteger(raw: unknown): ForeignNumberRead {
  if (typeof raw === "number" && Number.isSafeInteger(raw) === true) {
    return { kind: "ok", value: raw };
  }
  return { kind: "refused" };
}

export type DeclaredContentLength =
  | { readonly kind: "absent" }
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "refused" };

/** Content-Length must be ASCII digits before any numeric parse. */
export function readDeclaredContentLength(raw: unknown): DeclaredContentLength {
  if (raw === null || raw === undefined) {
    return { kind: "absent" };
  }
  if (typeof raw !== "string") {
    return { kind: "refused" };
  }
  if (/^[0-9]+$/.test(raw) !== true) {
    return { kind: "refused" };
  }
  const n = readForeignSafeInteger(Number(raw));
  switch (n.kind) {
    case "ok":
      if (n.value < 0) {
        return { kind: "refused" };
      }
      return { kind: "ok", value: n.value };
    case "refused":
      return { kind: "refused" };
    default: {
      const _closed: never = n;
      void _closed;
      return { kind: "refused" };
    }
  }
}

export type CappedBodyRead =
  | { readonly kind: "ok"; readonly body: Uint8Array }
  | { readonly kind: "too_large" }
  | { readonly kind: "refused" };

export type CappedStreamReader = {
  read(): Promise<{ readonly done: boolean; readonly value?: unknown }>;
  cancel(): Promise<void>;
};

export type CappedStream = {
  getReader(): CappedStreamReader;
};

function wipeOwned(chunks: readonly Uint8Array[]): void {
  for (const chunk of chunks) {
    chunk.fill(0);
  }
}

async function cancelReader(reader: CappedStreamReader): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // cancel is best-effort
  }
}

/**
 * Read a byte stream up to `cap`. Every already-read chunk and the over-cap or
 * refused chunk is zeroed on too_large, refused, and catch exits.
 */
export async function readBodyCapped(
  stream: CappedStream | null,
  cap: number,
): Promise<CappedBodyRead> {
  const capRead = readForeignSafeInteger(cap);
  if (capRead.kind !== "ok" || capRead.value < 0) {
    return { kind: "refused" };
  }
  if (stream === null) {
    return { kind: "ok", body: new Uint8Array(0) };
  }
  let reader: CappedStreamReader;
  try {
    reader = stream.getReader();
  } catch {
    return { kind: "refused" };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const step = await reader.read();
      if (step.done === true) {
        break;
      }
      if (step.done !== false) {
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "refused" };
      }
      const value = step.value;
      if (!(value instanceof Uint8Array)) {
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "refused" };
      }
      const n = readForeignSafeInteger(value.byteLength);
      switch (n.kind) {
        case "ok":
          break;
        case "refused":
          value.fill(0);
          wipeOwned(chunks);
          await cancelReader(reader);
          return { kind: "refused" };
        default: {
          const _closed: never = n;
          void _closed;
          value.fill(0);
          wipeOwned(chunks);
          await cancelReader(reader);
          return { kind: "refused" };
        }
      }
      total += n.value;
      const totalRead = readForeignSafeInteger(total);
      if (totalRead.kind !== "ok" || total > capRead.value) {
        value.fill(0);
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    wipeOwned(chunks);
    await cancelReader(reader);
    return { kind: "refused" };
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  return { kind: "ok", body };
}
