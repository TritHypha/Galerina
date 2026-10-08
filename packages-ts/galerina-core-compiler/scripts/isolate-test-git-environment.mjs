const repositoryRoutingKeys = new Set([
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_WORK_TREE",
]);

for (const key of Object.keys(process.env)) {
  if (repositoryRoutingKeys.has(key.toUpperCase())) delete process.env[key];
}
