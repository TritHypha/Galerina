// @galerina/docs — public surface.
//
// An OpenAPI 3.x generator over the App Kernel's governed route table. The two
// entry points (`generateOpenApi` and its spec-named alias `exportOpenApi`) take
// route declarations and/or resolved effective policies and emit a valid OpenAPI
// document, failing closed (`OpenApiGenerationError`) rather than emit an invalid
// or misleading API contract. See README.md and the api-server README §30 spec.
export * from "./types.js";
export { generateOpenApi, exportOpenApi } from "./openapi.js";
export { OpenApiGenerationError, validateOpenApiDocument } from "./validate.js";
