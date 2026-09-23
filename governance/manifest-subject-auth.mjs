/**
 * Manifest authentication subject selection.
 * The checked artifact is the decoded CBOR `.lmanifest`. A JSON sidecar may
 * carry a human copy; its signature is not authentication of the CBOR subject.
 */

function isObjectSignature(sig) {
  return sig !== null
    && typeof sig === "object"
    && typeof sig.signature === "string"
    && sig.signature.length > 0
    && sig.signature !== "placeholder";
}

/**
 * @param {unknown} cborManifest decoded CBOR subject
 * @param {unknown} jsonSidecar parsed `.lmanifest.json` or null
 * @returns {{ source: "cbor", body: object, sig: object } | { unsigned: true } | { refuse: string }}
 */
export function selectManifestAuthSubject(cborManifest, jsonSidecar) {
  if (cborManifest === null || typeof cborManifest !== "object" || Array.isArray(cborManifest)) {
    return { refuse: "FUNGI-MANIFEST-INVALID: checked CBOR subject is missing" };
  }
  const cborSig = cborManifest.governanceSignature;
  const jsonSig = jsonSidecar !== null && typeof jsonSidecar === "object" && !Array.isArray(jsonSidecar)
    ? jsonSidecar.governanceSignature
    : undefined;

  if (isObjectSignature(cborSig)) {
    const { governanceSignature: _sig, ...body } = cborManifest;
    if (isObjectSignature(jsonSig) && jsonSig.signature !== cborSig.signature) {
      return { refuse: "FUNGI-MANIFEST-TAMPER: JSON sidecar signature does not match the checked CBOR subject" };
    }
    return { source: "cbor", body, sig: cborSig };
  }

  if (isObjectSignature(jsonSig)) {
    return { refuse: "FUNGI-MANIFEST-TAMPER: JSON sidecar signature is not the checked CBOR subject" };
  }

  return { unsigned: true };
}

/**
 * The previous verify bind (sourceHash + schemaVersion only) accepts a sidecar
 * whose signed body disagrees with CBOR on other fields. That is the defect.
 */
export function sidecarBindIsInsufficient(cborManifest, jsonSidecar) {
  if (cborManifest === null || typeof cborManifest !== "object") return false;
  if (jsonSidecar === null || typeof jsonSidecar !== "object") return false;
  return jsonSidecar.sourceHash === cborManifest.sourceHash
    && jsonSidecar.schemaVersion === cborManifest.schemaVersion
    && jsonSidecar.flowCount !== cborManifest.flowCount;
}
