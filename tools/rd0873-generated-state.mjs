#!/usr/bin/env node
import { auditGeneratedState, runAudit } from "./rd0873-read-only-audit-lib.mjs";

runAudit(auditGeneratedState);
