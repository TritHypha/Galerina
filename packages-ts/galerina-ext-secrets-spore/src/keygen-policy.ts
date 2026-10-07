/** @internal Enforce the key-output policy before any key material is generated. */
export function generateKeypairForOutput<T>(
  stderrIsTTY: boolean,
  force: boolean,
  generate: () => T,
  refuse: () => never,
): T {
  if (stderrIsTTY && !force) refuse();
  return generate();
}
