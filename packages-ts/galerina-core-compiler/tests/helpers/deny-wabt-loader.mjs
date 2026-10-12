export async function resolve(specifier, context, nextResolve) {
  if (specifier === "wabt") {
    const error = new Error("WABT deliberately disabled by fallback test");
    error.code = "ERR_MODULE_NOT_FOUND";
    throw error;
  }
  return nextResolve(specifier, context);
}
