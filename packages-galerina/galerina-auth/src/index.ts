// @galerina/auth — standalone authentication/authorization FACTOR provider.
//
// The way spring-security, Django contrib.auth, and NestJS passport ship auth as a
// unit separate from the framework core, galerina-auth is the standalone home for the
// auth/identity FACTORS the App Kernel folds at its admission gate. It computes K3
// verdicts; it does NOT decide admission — the kernel does (it collapses the
// composed `channelVerdict` fail-closed). See README.md for the boundary.
//
//   verdict.ts        — the K3 verdict algebra (re-exported vocabulary)
//   channel.ts        — TLSTP S1 channel/identity factor (delegates to the certGate)
//   credential.ts     — the required-auth posture: header presence is NOT auth
//   authorization.ts  — scope authorization factor (request-time RBAC)
//   compose.ts        — fold factors → the one verdict the kernel folds

export * from "./verdict.js";
export * from "./channel.js";
export * from "./credential.js";
export * from "./authorization.js";
export * from "./compose.js";
