import type { CaseStep } from "./caseService";
import { getStepDef } from "./stepCatalog";

/** Family-facing labels — hide internal notes / staff-only wording when needed. */
export function toFamilyStepLabel(stepCode: string, fallbackLabel: string): string {
  const def = getStepDef(stepCode);
  return def?.label ?? fallbackLabel;
}

export type FamilyStatusResponse = {
  decedent_display_name: string;
  funeral_home_name: string;
  status: string;
  current_step_label: string | null;
  steps: Array<{ label: string; recorded_at: string }>;
};

export function buildFamilyStatus(args: {
  decedentDisplayName: string;
  funeralHomeName: string;
  status: string;
  steps: CaseStep[];
}): FamilyStatusResponse {
  const steps = args.steps.map((s) => ({
    label: toFamilyStepLabel(s.step_code, s.step_label),
    recorded_at: s.recorded_at,
  }));
  const last = steps[steps.length - 1];
  return {
    decedent_display_name: args.decedentDisplayName,
    funeral_home_name: args.funeralHomeName,
    status: args.status,
    current_step_label: last?.label ?? null,
    steps,
  };
}
