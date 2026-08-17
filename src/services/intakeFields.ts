const STRING_KEYS = [
  "person_name",
  "gender",
  "date_of_birth",
  "date_of_death",
  "next_of_kin_name",
  "next_of_kin_relationship",
  "next_of_kin_address",
  "next_of_kin_phone",
  "next_of_kin_email",
  "designated_pickup_person",
  "contact_name",
  "contact_phone",
  "contact_email",
] as const;

const GENDERS = new Set(["male", "female", "other"]);

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** FH-only intake from the Base44 field list. Unknown keys are dropped. */
export function sanitizeIntake(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const key of STRING_KEYS) {
    const value = asTrimmedString(raw[key]);
    if (!value) continue;
    if (key === "gender" && !GENDERS.has(value.toLowerCase())) continue;
    out[key] = key === "gender" ? value.toLowerCase() : value;
  }
  return out;
}

export function displayNameFromIntake(
  intake: Record<string, unknown>,
  fallback: string,
): string {
  const name = asTrimmedString(intake.person_name);
  return name ?? fallback;
}
