#!/usr/bin/env node
import { auditCorpus, runAudit } from "./rd0873-read-only-audit-lib.mjs";

runAudit(() => auditCorpus("corpus-packages-fungi", "packages/fungi"));
