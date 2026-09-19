#!/usr/bin/env node
import { auditFinalState, runAudit } from "./rd0873-read-only-audit-lib.mjs";

runAudit(auditFinalState);
