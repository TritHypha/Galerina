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

type IntrinsicGetter =
  | { readonly kind: "captured"; readonly fn: (this: unknown) => unknown }
  | { readonly kind: "absent" };

type IntrinsicFill =
  | { readonly kind: "captured"; readonly fn: (this: unknown, value: number) => unknown }
  | { readonly kind: "absent" };

type IntrinsicsState =
  | { readonly kind: "ready" }
  | { readonly kind: "absent" };

type BodySlot =
  | { readonly kind: "unallocated" }
  | { readonly kind: "allocated"; readonly bytes: Uint8Array };

type BufferKind =
  | { readonly kind: "fixed" }
  | { readonly kind: "forbidden" };

const TYPED_ARRAY_PROTO: object = Object.getPrototypeOf(Uint8Array.prototype) as object;

function captureByteLengthGetter(): IntrinsicGetter {
  let desc: PropertyDescriptor | undefined;
  try {
    desc = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, "byteLength");
  } catch {
    return { kind: "absent" };
  }
  if (desc === undefined) {
    return { kind: "absent" };
  }
  if (typeof desc.get !== "function") {
    return { kind: "absent" };
  }
  return { kind: "captured", fn: desc.get };
}

function captureFill(): IntrinsicFill {
  const fill = (TYPED_ARRAY_PROTO as { readonly fill?: unknown }).fill;
  if (typeof fill !== "function") {
    return { kind: "absent" };
  }
  return { kind: "captured", fn: fill as (this: unknown, value: number) => unknown }; /* AUTH_VERIFY_GUARD_FILL_CAPTURE */
}

function captureTypedBufferGetter(): IntrinsicGetter {
  let desc: PropertyDescriptor | undefined;
  try {
    desc = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, "buffer");
  } catch {
    return { kind: "absent" };
  }
  if (desc === undefined || typeof desc.get !== "function") {
    return { kind: "absent" };
  }
  return { kind: "captured", fn: desc.get };
}

function captureResizableGetter(): IntrinsicGetter {
  let desc: PropertyDescriptor | undefined;
  try {
    desc = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable");
  } catch {
    return { kind: "absent" };
  }
  if (desc === undefined || typeof desc.get !== "function") {
    return { kind: "absent" };
  }
  return { kind: "captured", fn: desc.get };
}

function captureSabByteLengthGetter(): IntrinsicGetter {
  if (typeof SharedArrayBuffer !== "function") {
    return { kind: "absent" };
  }
  let desc: PropertyDescriptor | undefined;
  try {
    desc = Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, "byteLength");
  } catch {
    return { kind: "absent" };
  }
  if (desc === undefined || typeof desc.get !== "function") {
    return { kind: "absent" };
  }
  return { kind: "captured", fn: desc.get };
}

function getterIsCaptured(cap: IntrinsicGetter): boolean {
  switch (cap.kind) {
    case "captured":
      return true;
    case "absent":
      return false;
    default: {
      const _closed: never = cap;
      void _closed;
      return false;
    }
  }
}

function resolveIntrinsics(
  lengthGet: IntrinsicGetter,
  fill: IntrinsicFill,
  bufferGet: IntrinsicGetter,
  resizableGet: IntrinsicGetter,
  sabGet: IntrinsicGetter,
  sabExists: boolean,
): IntrinsicsState {
  if (getterIsCaptured(lengthGet) !== true) {
    return { kind: "absent" };
  }
  switch (fill.kind) {
    case "captured":
      break;
    case "absent":
      return { kind: "absent" };
    default: {
      const _closed: never = fill;
      void _closed;
      return { kind: "absent" };
    }
  }
  if (getterIsCaptured(bufferGet) !== true) {
    return { kind: "absent" };
  }
  if (getterIsCaptured(resizableGet) !== true) {
    return { kind: "absent" };
  }
  if (sabExists === true && getterIsCaptured(sabGet) !== true) {
    return { kind: "absent" };
  }
  return { kind: "ready" };
}

const INTRINSIC_BYTE_LENGTH_GET = captureByteLengthGetter();
const INTRINSIC_FILL = captureFill();
const INTRINSIC_BUFFER_GET = captureTypedBufferGetter();
const INTRINSIC_RESIZABLE_GET = captureResizableGetter();
const INTRINSIC_SAB_BYTE_LENGTH_GET = captureSabByteLengthGetter();
const SHARED_ARRAY_BUFFER_PRESENT = typeof SharedArrayBuffer === "function";
const INTRINSICS = resolveIntrinsics(
  INTRINSIC_BYTE_LENGTH_GET,
  INTRINSIC_FILL,
  INTRINSIC_BUFFER_GET,
  INTRINSIC_RESIZABLE_GET,
  INTRINSIC_SAB_BYTE_LENGTH_GET,
  SHARED_ARRAY_BUFFER_PRESENT,
);

function intrinsicLength(chunk: object): ForeignNumberRead {
  switch (INTRINSIC_BYTE_LENGTH_GET.kind) {
    case "captured": {
      let raw: unknown;
      try {
        raw = Reflect.apply(INTRINSIC_BYTE_LENGTH_GET.fn, chunk, []);
      } catch {
        return { kind: "refused" };
      }
      return readForeignSafeInteger(raw);
    }
    case "absent":
      return { kind: "refused" };
    default: {
      const _closed: never = INTRINSIC_BYTE_LENGTH_GET;
      void _closed;
      return { kind: "refused" };
    }
  }
}

function intrinsicWipe(chunk: object): void {
  switch (INTRINSIC_FILL.kind) {
    case "captured":
      break;
    case "absent":
      return;
    default: {
      const _closed: never = INTRINSIC_FILL;
      void _closed;
      return;
    }
  }
  try {
    Reflect.apply(INTRINSIC_FILL.fn, chunk, [0]);
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

function classifyBuffer(chunk: Uint8Array): BufferKind {
  switch (INTRINSIC_BUFFER_GET.kind) {
    case "captured":
      break;
    case "absent":
      return { kind: "forbidden" };
    default: {
      const _closed: never = INTRINSIC_BUFFER_GET;
      void _closed;
      return { kind: "forbidden" };
    }
  }
  let buf: unknown;
  try {
    buf = Reflect.apply(INTRINSIC_BUFFER_GET.fn, chunk, []);
  } catch {
    return { kind: "forbidden" };
  }
  if (SHARED_ARRAY_BUFFER_PRESENT === true) {
    switch (INTRINSIC_SAB_BYTE_LENGTH_GET.kind) {
      case "captured": {
        try {
          Reflect.apply(INTRINSIC_SAB_BYTE_LENGTH_GET.fn, buf, []);
          return { kind: "forbidden" };
        } catch {
          break;
        }
      }
      case "absent":
        return { kind: "forbidden" };
      default: {
        const _closed: never = INTRINSIC_SAB_BYTE_LENGTH_GET;
        void _closed;
        return { kind: "forbidden" };
      }
    }
  }
  switch (INTRINSIC_RESIZABLE_GET.kind) {
    case "captured":
      break;
    case "absent":
      return { kind: "forbidden" };
    default: {
      const _closed: never = INTRINSIC_RESIZABLE_GET;
      void _closed;
      return { kind: "forbidden" };
    }
  }
  let flag: unknown;
  try {
    flag = Reflect.apply(INTRINSIC_RESIZABLE_GET.fn, buf, []);
  } catch {
    return { kind: "forbidden" };
  }
  const classified = classifyResizableFlag(flag);
  switch (classified.kind) {
    case "fixed":
      return { kind: "fixed" };
    case "forbidden":
      return { kind: "forbidden" };
    default: {
      const _closed: never = classified;
      void _closed;
      return { kind: "forbidden" };
    }
  }
}

/** Closed: only a proven false resizable flag is a fixed buffer. True and unexpected refuse. */
function classifyResizableFlag(flag: unknown): BufferKind {
  if (flag === false) {
    return { kind: "fixed" };
  }
  return { kind: "forbidden" }; /* AUTH_VERIFY_GUARD_RESIZABLE_NOT_FALSE */
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
 * captured fill intrinsic. Assembly never rejects. Missing either intrinsic
 * refuses every read. Resizable and SharedArrayBuffer chunks are refused.
 */
export async function readBodyCapped(
  stream: CappedStream | null,
  cap: number,
): Promise<CappedBodyRead> {
  const capRead = readForeignSafeInteger(cap);
  if (capRead.kind !== "ok" || capRead.value < 0) {
    return { kind: "refused" };
  }
  switch (INTRINSICS.kind) {
    case "ready":
      break;
    case "absent":
      return { kind: "refused" };
    default: {
      const _closed: never = INTRINSICS;
      void _closed;
      return { kind: "refused" };
    }
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
      let bufKind: BufferKind;
      try {
        bufKind = classifyBuffer(value);
      } catch {
        intrinsicWipe(value);
        wipeOwned(chunks);
        await cancelReader(reader);
        return { kind: "refused" };
      }
      switch (bufKind.kind) {
        case "fixed":
          break;
        case "forbidden":
          intrinsicWipe(value);
          wipeOwned(chunks);
          await cancelReader(reader);
          return { kind: "refused" };
        default: {
          const _closed: never = bufKind;
          void _closed;
          intrinsicWipe(value);
          wipeOwned(chunks);
          await cancelReader(reader);
          return { kind: "refused" };
        }
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
  let body: BodySlot = { kind: "unallocated" };
  try {
    const allocated = new Uint8Array(total);
    body = { kind: "allocated", bytes: allocated };
    let offset = 0;
    for (const chunk of chunks) {
      allocated.set(chunk.bytes, offset);
      offset += chunk.length;
      intrinsicWipe(chunk.bytes); /* AUTH_VERIFY_GUARD_OK_WIPE */
    }
    return { kind: "ok", body: allocated };
  } catch {
    wipeOwned(chunks); /* AUTH_VERIFY_GUARD_ASSEMBLY_CATCH_WIPE */
    switch (body.kind) {
      case "allocated":
        intrinsicWipe(body.bytes);
        break;
      case "unallocated":
        break;
      default: {
        const _closed: never = body;
        void _closed;
        break;
      }
    }
    await cancelReader(reader);
    return { kind: "refused" };
  }
}
