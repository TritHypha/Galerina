"use strict";

// CPU output prototype (TODO Create CPU output prototype, SuperGrok 2026-10-08j).
// Writes the documented app.bin placeholder. Not a Windows .exe or Linux ELF.

const PLACEHOLDER_TEXT =
  "Galerina prototype CPU-compatible output\nThis file is a placeholder manifest, not a native binary.\n";

function emitCpuOutput(linked) {
  const admitted = Boolean(linked && linked.status === "ADMITTED" && linked.linked);
  return {
    schema: "galerina.core.cpu-output.v1",
    kind: "cpu-compatible-placeholder",
    executable: false,
    platform: "not-windows-or-linux",
    runtimeStatus: "placeholder",
    admitted,
    text: PLACEHOLDER_TEXT
  };
}

module.exports = {
  PLACEHOLDER_TEXT,
  emitCpuOutput
};
