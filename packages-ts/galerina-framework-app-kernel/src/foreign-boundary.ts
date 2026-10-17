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

type OwnedChunk = {
  readonly bytes: Uint8Array;
  readonly length: number;
};

const TYPED_ARRAY_PROTO: object = Object.getPrototypeOf(Uint8Array.prototype) as object;

function captureByteLengthGetter(): ((this: unknown) => unknown) | null {
  const desc = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, "byteLength");
  if (desc === undefined || typeof desc.get !== "function") {
    return null;
  }
  return desc.get;
}

function captureFill(): ((this: unknown, value: number) => unknown) | null {
  const fill = (TYPED_ARRAY_PROTO as { readonly fill?: unknown }).fill;
  if (typeof fill !== "function") {
    return null;
  }
  return fill as (this: unknown, value: number) => unknown;
}

const INTRINSIC_BYTE_LENGTH_GET = captureByteLengthGetter();
const INTRINSIC_FILL = captureFill();

function intrinsicLength(chunk: object): ForeignNumberRead {
  if (INTRINSIC_BYTE_LENGTH_GET === null) {
    return { kind: "refused" };
  }
  let raw: unknown;
  try {
    raw = Reflect.apply(INTRINSIC_BYTE_LENGTH_GET, chunk, []);
  } catch {
    return { kind: "refused" };
  }
  return readForeignSafeInteger(raw);
}

function intrinsicWipe(chunk: object): void {
  if (INTRINSIC_FILL === null) {
    return;
  }
  try {
    Reflect.apply(INTRINSIC_FILL, chunk, [0]);
  } catch {
    // wipe is best-effort
  }
}

function wipeOwned(chunks: readonly OwnedChunk[]): void {
  for (const chunk of chunks) {
    intrinsicWipe(chunk.bytes);
  }
}

function isExactUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && Object.getPrototypeOf(value) === Uint8Array.prototype;
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
 * refused chunk is zeroed on too_large, refused, and catch exits. Length is
 * read once through the captured TypedArray byteLength getter. Wipe uses the
 * captured fill intrinsic. Assembly never rejects.
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
  const chunks: OwnedChunk[] = [];
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
      if (!isExactUint8Array(value)) {
        if (value instanceof Uint8Array) {
          intrinsicWipe(value);
        }
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "refused" };
      }
      const n = intrinsicLength(value);
      switch (n.kind) {
        case "ok":
          break;
        case "refused":
          intrinsicWipe(value);
          wipeOwned(chunks);
          await cancelReader(reader);
          return { kind: "refused" };
        default: {
          const _closed: never = n;
          void _closed;
          intrinsicWipe(value);
          wipeOwned(chunks);
          await cancelReader(reader);
          return { kind: "refused" };
        }
      }
      if (n.value < 0) {
        intrinsicWipe(value);
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "refused" };
      }
      const length = n.value;
      total += length;
      const totalRead = readForeignSafeInteger(total);
      if (totalRead.kind !== "ok") {
        intrinsicWipe(value);
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "refused" };
      }
      if (total > capRead.value) {
        intrinsicWipe(value);
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "too_large" };
      }
      chunks.push({ bytes: value, length });
    }
  } catch {
    wipeOwned(chunks);
    await cancelReader(reader);
    return { kind: "refused" };
  }
  let body: Uint8Array | undefined;
  try {
    body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk.bytes, offset);
      offset += chunk.length;
      intrinsicWipe(chunk.bytes);
    }
    return { kind: "ok", body };
  } catch {
    wipeOwned(chunks);
    if (body !== undefined) {
      intrinsicWipe(body);
    }
    await cancelReader(reader);
    return { kind: "refused" };
  }
}
