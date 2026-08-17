import type { CaseStep } from "./caseService";
import { getStepDef } from "./stepCatalog";

/** Family-facing labels from the Base44 prototype (not staff ops wording). */
const FAMILY_STEP_LABELS: Record<string, string> = {
  received_into_care: "Loved one has been brought into our care",
  dressed_per_wishes: "Preparation of loved one",
  documents_signed: "Preparation of loved one",
  town_permit_applied: "Preparation of loved one",
  me_clearance_received: "Preparation of loved one",
  crematory_appointment_set: "Preparation of loved one",
  placed_in_container: "Preparation of loved one",
  transported_to_crematory: "Route to crematory",
  dropped_off_at_crematory: "Have been received by crematory",
  custody_accepted: "Have been received by crematory",
  in_holding: "Loved one is in crematory holding facility",
  cremation_in_progress: "Cremation in progress",
  remains_sorted: "Cremation complete",
  remains_processed: "Cremated remains preparation",
  remains_boxed: "Cremated remains preparation",
  remains_ready: "Cremated remains ready to be picked up by funeral home",
  remains_returned: "Funeral home has picked up cremated remains",
};

export function toFamilyStepLabel(stepCode: string, fallbackLabel: string): string {
  return FAMILY_STEP_LABELS[stepCode] ?? getStepDef(stepCode)?.label ?? fallbackLabel;
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
