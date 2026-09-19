#!/usr/bin/env node
import { auditCorpus, runAudit } from "./rd0873-read-only-audit-lib.mjs";

runAudit(() => auditCorpus("corpus-self-hosted", "packages-ts/galerina-core-compiler/src/self-hosted"));
