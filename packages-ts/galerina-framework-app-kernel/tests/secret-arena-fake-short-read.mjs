#!/usr/bin/env node
import { writeSync } from "node:fs";

writeSync(1, Buffer.from([0, 0]));
process.exit(0);
