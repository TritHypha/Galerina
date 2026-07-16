// lib/scrub-paths.mjs — genericize absolute-local-path + Windows env-var-literal leaks OUT of any text that
// gets written into a committed artifact (kb-index headings, code-index, generated reports). Extracted from
// kb-index.mjs so it is IMPORTABLE and UNIT-TESTABLE (it previously ran only on-import, invisible to tests).
//
// The patterns are the lockstep of scripts/audit-path-leak.mjs's detectors: `C:\Users\<name>\...`, `wwwprojects\`,
// and the %USERPROFILE%-style Windows env-var path literals. A generator that scrubs the SAME classes the gate
// forbids means a regen can never re-introduce a leak (the fix + detector are one unit).
export function scrubPaths(s) {
  return String(s)
    .replace(/[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[^\s"'`)\]]+/g, "<path>")
    .replace(/(?:[A-Za-z]:[\\/]{1,2})?wwwprojects[\\/][^\s"'`)\]]*/g, "<path>")
    // Windows env-var path literals (USERPROFILE / APPDATA / HOMEPATH etc., percent-wrapped) — the
    // `windows-env-literal` class the path-leak gate enforces. A bare `userprofile` token carries no `%%` and
    // never trips the %-anchored gate, so only the wrapped literal is genericized.
    .replace(/%(?:USERPROFILE|USERNAME|HOMEPATH|HOMEDRIVE|APPDATA|LOCALAPPDATA)%/gi, "<env-var>");
}
