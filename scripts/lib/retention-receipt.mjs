// Parse one audit-memory-leak child result. A dynamic retention receipt is
// evidence only when the child completed with a recognized status and emitted
// every measured channel plus one status-consistent verdict.

const CHANNELS = ["heapUsed", "external", "arrayBuffers", "rss", "durationUs"];

export function parseRetentionReceipt({ status, stdout = "", stderr = "" }) {
  const output = String(stdout) + String(stderr);

  if (status !== 0 && status !== 1) {
    return {
      ok: false,
      reason: `child ended with unrecognized status ${status === null ? "null" : String(status)}`,
    };
  }

  const markers = [...output.matchAll(/^== subject ==\s*$/gm)];
  if (markers.length !== 1) {
    return { ok: false, reason: `expected exactly one subject marker, found ${markers.length}` };
  }
  const subject = output.slice(markers[0].index);
  if (/\b(?:ERROR|harness error)\s*:/i.test(subject)) {
    return { ok: false, reason: "subject reported an error" };
  }

  const channelLines = [];
  for (const channel of CHANNELS) {
    const matches = [...subject.matchAll(new RegExp(`^\\s{4}${channel}\\s+[^\\r\\n]+$`, "gm"))];
    if (matches.length !== 1) {
      return { ok: false, reason: `expected one ${channel} measurement, found ${matches.length}` };
    }
    channelLines.push(matches[0][0]);
  }

  const verdictLines = [...subject.matchAll(/^\s{4}->[^\r\n]*$/gm)];
  if (verdictLines.length !== 1) {
    return { ok: false, reason: `expected exactly one subject verdict, found ${verdictLines.length}` };
  }
  const verdict = verdictLines[0][0].trimStart().slice(3).trim();
  const leak = /^LEAK: .+$/u.test(verdict);
  const clean = verdict === "no leak detected on the measured channels";
  if (!leak && !clean) {
    return { ok: false, reason: `unrecognized subject verdict: ${verdict}` };
  }
  if ((status === 0 && !clean) || (status === 1 && !leak)) {
    return { ok: false, reason: `child status ${status} disagrees with verdict ${verdict}` };
  }

  return { ok: true, leak, verdict, channelLines };
}
