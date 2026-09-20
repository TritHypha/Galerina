// Parse one audit-memory-leak child result. A dynamic retention receipt is
// evidence only when the child completed with a recognized status and emitted
// every measured channel plus one status-consistent verdict.

const NUMBER = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const CHANNELS = {
  heapUsed: { unit: "KB/iter", growthUnit: "KB", ceilingUnit: "KB/iter", tags: ["within band", "★ OVER BAND"] },
  external: { unit: "KB/iter", growthUnit: "KB", ceilingUnit: "KB/iter", tags: ["within band", "★ OVER BAND"] },
  arrayBuffers: { unit: "KB/iter", growthUnit: "KB", ceilingUnit: "KB/iter", tags: ["within band", "★ OVER BAND"] },
  rss: { unit: "KB/iter", growthUnit: "KB", ceilingUnit: "KB/iter", tags: ["corroboration only"] },
  durationUs: { unit: "ms/iter", growthUnit: "ms/iter", ceilingUnit: "ms/iter", tags: ["symptom only"] },
};

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
  const overBand = [];
  for (const [channel, format] of Object.entries(CHANNELS)) {
    const tags = format.tags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const labelledLines = [...subject.matchAll(new RegExp(`^\\s{4}${channel}\\b[^\\r\\n]*$`, "gm"))];
    if (labelledLines.length !== 1) {
      return { ok: false, reason: `expected one ${channel} measurement, found ${labelledLines.length}` };
    }
    const linePattern = new RegExp(
      `^\\s{4}${channel}\\s+(${NUMBER})\\s+${format.unit}\\s+(${NUMBER})\\s+${format.growthUnit}\\s+(${NUMBER})\\s+${format.ceilingUnit}\\s+(${tags})$`,
    );
    const match = linePattern.exec(labelledLines[0][0]);
    if (!match) {
      return { ok: false, reason: `${channel} measurement has invalid syntax, units, or classification` };
    }
    const values = match.slice(1, 4).map(Number);
    if (!values.every(Number.isFinite)) {
      return { ok: false, reason: `${channel} measurement is not finite` };
    }
    if (channel === "heapUsed" || channel === "external" || channel === "arrayBuffers") {
      if (values[0] > values[2] && match[4] !== "★ OVER BAND") {
        return { ok: false, reason: `${channel} slope exceeds ceiling but is not marked OVER BAND` };
      }
      if (values[0] < values[2] && match[4] === "★ OVER BAND") {
        return { ok: false, reason: `${channel} is marked OVER BAND below its ceiling` };
      }
    }
    if (match[4] === "★ OVER BAND") overBand.push(channel);
    channelLines.push(match[0]);
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
  if (clean && overBand.length > 0) {
    return { ok: false, reason: `clean verdict contradicts OVER BAND channel(s): ${overBand.join(", ")}` };
  }
  if (leak) {
    const flagged = verdict.slice("LEAK: ".length).split(",").map((channel) => channel.trim());
    const expected = [...overBand].sort();
    const actual = [...flagged].sort();
    if (flagged.some((channel) => !Object.hasOwn(CHANNELS, channel)) || flagged.length !== new Set(flagged).size
      || actual.length !== expected.length || actual.some((channel, index) => channel !== expected[index])) {
      return { ok: false, reason: `verdict channels do not match OVER BAND channels: ${verdict}` };
    }
  }
  if ((status === 0 && !clean) || (status === 1 && !leak)) {
    return { ok: false, reason: `child status ${status} disagrees with verdict ${verdict}` };
  }

  return { ok: true, leak, verdict, channelLines };
}
