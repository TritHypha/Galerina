/**
 * PBI — the Photonic Bus Interface seam.
 *
 * An abstract ingest-source boundary. LSIO can pull bytes from several physical
 * transports; {@link PhotonicBusInterface} is the common contract. Today only the
 * {@link LocalDiskBus} is real (an in-process byte source). {@link PhotonicBus} is
 * the documented FUTURE seam for a photonic interconnect: its surface exists so
 * downstream wiring can target it, but it is not present in this build and every
 * method refuses with a {@link HardenedBorderViolation}.
 */

import { HardenedBorderViolation, SecurityTrap } from "./errors.js";

export type IngestSourceKind = "disk" | "nvme" | "photonic";

export abstract class PhotonicBusInterface {
  abstract readonly kind: IngestSourceKind;
  abstract connect(): void;
  abstract stream(offset: number, length: number): Uint8Array;
  abstract validateBusIntegrity(): boolean;
}

/**
 * Default, real ingest source: a fixed in-process byte buffer. `stream` returns
 * a zero-copy `subarray` view (no copy) over the underlying data.
 */
export class LocalDiskBus extends PhotonicBusInterface {
  readonly kind: IngestSourceKind = "disk";
  readonly #data: Uint8Array;
  #connected = false;

  constructor(data: Uint8Array) {
    super();
    this.#data = data;
  }

  /** Marks the bus connected. No-op otherwise. */
  connect(): void {
    this.#connected = true;
  }

  /**
   * Zero-copy view over [offset, offset+length). Throws
   * {@link SecurityTrap} ("LSIO-BUS-001") if not connected or out of range.
   */
  stream(offset: number, length: number): Uint8Array {
    if (!this.#connected) {
      throw new SecurityTrap("LSIO-BUS-001", "disk bus not connected");
    }
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > this.#data.length
    ) {
      throw new SecurityTrap(
        "LSIO-BUS-001",
        `stream range [${offset}, ${offset + length}) out of bounds for length ${this.#data.length}`,
      );
    }
    return this.#data.subarray(offset, offset + length);
  }

  /** The local disk bus is always considered integral. */
  validateBusIntegrity(): boolean {
    return true;
  }
}

/**
 * Documented FUTURE seam: a photonic interconnect ingest bus. Not present in
 * this build — every operation refuses with {@link HardenedBorderViolation}
 * ("LSIO-PBI-001"). The host that lands a real photonic transport replaces this
 * class with one that drives the hardware.
 */
export class PhotonicBus extends PhotonicBusInterface {
  readonly kind: IngestSourceKind = "photonic";

  connect(): void {
    throw new HardenedBorderViolation(
      "LSIO-PBI-001",
      "photonic ingest bus not present in this build",
    );
  }

  stream(_offset: number, _length: number): Uint8Array {
    throw new HardenedBorderViolation(
      "LSIO-PBI-001",
      "photonic ingest bus not present in this build",
    );
  }

  validateBusIntegrity(): boolean {
    return false;
  }
}
