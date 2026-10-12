export async function resolve(specifier, context, nextResolve) {
  if (specifier === "wabt") {
    return {
      url: new URL("./rejecting-wabt.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
