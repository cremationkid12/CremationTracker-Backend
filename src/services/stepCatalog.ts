import type { OrgType } from "../types/domain";

export type StepDef = {
  code: string;
  label: string;
  /** Which org type may record this step (handoff claim is separate). */
  actor: OrgType | "either";
  /** When true, recording this step marks the case completed + archived. */
  completesCase?: boolean;
};

/** Linear cremation process used for next-step suggestions. */
export const STEP_CATALOG: StepDef[] = [
  {
    code: "received_into_care",
    label: "Received into care of funeral home",
    actor: "funeral_home",
  },
  {
    code: "dressed_per_wishes",
    label: "Dressed per family wishes",
    actor: "funeral_home",
  },
  {
    code: "documents_signed",
    label: "Cremation documents signed",
    actor: "funeral_home",
  },
  {
    code: "town_permit_applied",
    label: "Town permit applied / received",
    actor: "funeral_home",
  },
  {
    code: "me_clearance_received",
    label: "Medical examiner clearance / cremation number",
    actor: "funeral_home",
  },
  {
    code: "crematory_appointment_set",
    label: "Crematory appointment scheduled",
    actor: "funeral_home",
  },
  {
    code: "placed_in_container",
    label: "Placed in casket or cremation box",
    actor: "funeral_home",
  },
  {
    code: "transported_to_crematory",
    label: "Transported to crematory",
    actor: "funeral_home",
  },
  {
    code: "dropped_off_at_crematory",
    label: "Dropped off at crematory",
    actor: "funeral_home",
  },
  {
    code: "custody_accepted",
    label: "Crematory accepted custody",
    actor: "crematory",
  },
  {
    code: "in_holding",
    label: "In holding room",
    actor: "crematory",
  },
  {
    code: "cremation_in_progress",
    label: "Cremation in progress",
    actor: "crematory",
  },
  {
    code: "remains_sorted",
    label: "Remains sorted (devices/implants removed)",
    actor: "crematory",
  },
  {
    code: "remains_processed",
    label: "Cremated remains processed",
    actor: "crematory",
  },
  {
    code: "remains_boxed",
    label: "Cremated remains boxed",
    actor: "crematory",
  },
  {
    code: "remains_ready",
    label: "Remains ready for pickup or delivery",
    actor: "crematory",
  },
  {
    code: "remains_returned",
    label: "Remains picked up or delivered to family",
    actor: "either",
    completesCase: true,
  },
];

export const INITIAL_STEP = STEP_CATALOG[0];

export function getStepDef(code: string): StepDef | undefined {
  return STEP_CATALOG.find((s) => s.code === code);
}

export function listAvailableNextSteps(
  lastStepCode: string | null,
  actorOrgType: OrgType,
  custodyOrgType: OrgType,
): StepDef[] {
  if (!lastStepCode) return [STEP_CATALOG[0]];
  const idx = STEP_CATALOG.findIndex((s) => s.code === lastStepCode);
  if (idx < 0 || idx >= STEP_CATALOG.length - 1) return [];

  const next = STEP_CATALOG[idx + 1];
  // Only the org that currently has custody (matched by type) may advance,
  // except remains_returned which either may record.
  if (next.actor === "either") {
    return [next];
  }
  if (next.actor !== actorOrgType) return [];
  if (actorOrgType !== custodyOrgType) return [];
  return [next];
}
