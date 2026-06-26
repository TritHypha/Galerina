// =============================================================================
// Stage B Report — Galerina self-hosting milestone tracker
//
// Tracks the four Stage B milestone files:
//   1. lexer.spore
//   2. parser.spore
//   3. type-checker.spore
//   4. compiler.capabilities.spore
//
// Each milestone is tracked with a parse-error count and a parity status.
// =============================================================================

export interface StageBMilestone {
  readonly name: string;
  readonly file: string;
  readonly parseErrors: number;
  readonly parityStatus: "pending" | "partial" | "complete";
  readonly notes: string;
}

export interface StageBReport {
  readonly milestones: readonly StageBMilestone[];
  readonly overallStatus: "pending" | "partial" | "complete";
}

// ---------------------------------------------------------------------------
// The four canonical Stage B milestone files (in order)
// ---------------------------------------------------------------------------

const STAGE_B_MILESTONE_FILES: readonly { readonly name: string; readonly file: string }[] = [
  { name: "lexer",                file: "lexer.spore"                  },
  { name: "parser",               file: "parser.spore"                 },
  { name: "type-checker",         file: "type-checker.spore"           },
  { name: "compiler.capabilities",file: "compiler.capabilities.spore"  },
] as const;

function parityStatusFromErrors(errors: number): "pending" | "partial" | "complete" {
  if (errors === 0) return "complete";
  if (errors < 5) return "partial";
  return "pending";
}

function overallStatusFromMilestones(
  milestones: readonly StageBMilestone[],
): "pending" | "partial" | "complete" {
  const statuses = milestones.map((m) => m.parityStatus);
  if (statuses.every((s) => s === "complete")) return "complete";
  if (statuses.some((s) => s !== "pending")) return "partial";
  return "pending";
}

/**
 * Generate a Stage B report from parsed milestone data.
 *
 * Each entry in `parsedMilestones` corresponds to one of the four canonical
 * Stage B files. Any file not present in parsedMilestones is listed as
 * `pending` with an error count of -1 (file not yet parsed).
 *
 * @param parsedMilestones  Array of { name, file, errors } for files that
 *                          have been parsed. May be a subset of all 4.
 * @returns A StageBReport listing all 4 milestones with current status.
 */
export function generateStageBReport(
  parsedMilestones: readonly { name: string; file: string; errors: number }[],
): StageBReport {
  const milestoneMap = new Map<string, number>();
  for (const m of parsedMilestones) {
    milestoneMap.set(m.file, m.errors);
  }

  const milestones: StageBMilestone[] = STAGE_B_MILESTONE_FILES.map(({ name, file }) => {
    const errors = milestoneMap.get(file);
    if (errors === undefined) {
      return {
        name,
        file,
        parseErrors: -1,
        parityStatus: "pending" as const,
        notes: "Not yet parsed.",
      };
    }
    const parityStatus = parityStatusFromErrors(errors);
    const notes =
      errors === 0
        ? "Parses without errors."
        : `${errors} parse error(s) remaining.`;
    return {
      name,
      file,
      parseErrors: errors,
      parityStatus,
      notes,
    };
  });

  return {
    milestones,
    overallStatus: overallStatusFromMilestones(milestones),
  };
}
