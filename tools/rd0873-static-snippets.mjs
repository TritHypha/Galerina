#!/usr/bin/env node
import { auditStaticSnippets, runAudit } from "./rd0873-read-only-audit-lib.mjs";

runAudit(auditStaticSnippets);
