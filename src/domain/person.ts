// ─── Branded Types (smart constructors for type safety) ─────────

declare const PersonIdBrand: unique symbol;
export type PersonId = string & { readonly [PersonIdBrand]: typeof PersonIdBrand };
export const toPersonId = (value: string): PersonId => value as PersonId;

declare const CpfBrand: unique symbol;
export type Cpf = string & { readonly [CpfBrand]: typeof CpfBrand };
export const toCpf = (value: string): Cpf | null =>
  /^\d{11}$/.test(value) ? (value as Cpf) : null;

declare const IsoDateStr: unique symbol;
export type IsoDateString = string & { readonly [IsoDateStr]: typeof IsoDateStr };
export const toIsoDate = (value: string): IsoDateString | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? (value as IsoDateString) : null;

// ─── Domain Types ───────────────────────────────────────────────

export type Person = {
  readonly id: string;
  readonly fullName: string;
  readonly cpf: string | null;
  readonly birthDate: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreatePersonInput = {
  readonly fullName: string;
  readonly cpf?: string;
  readonly birthDate: string;
};

export type UpdatePersonInput = CreatePersonInput;

// ─── Validation (discriminated union result) ────────────────────

export type ValidationResult =
  | { readonly kind: "ok" }
  | { readonly kind: "error"; readonly message: string };

const ok = { kind: "ok" } as const satisfies ValidationResult;
const fail = (message: string): ValidationResult => ({ kind: "error", message });

export const validateCreatePerson = (input: CreatePersonInput): ValidationResult => {
  if (!input.fullName || input.fullName.trim().length === 0) return fail("fullName is required");
  if (input.fullName.length > 200) return fail("fullName must be at most 200 characters");
  if (input.cpf !== undefined && toCpf(input.cpf) === null) return fail("cpf must be exactly 11 digits");
  if (!input.birthDate) return fail("birthDate is required");
  if (toIsoDate(input.birthDate) === null) return fail("birthDate must be YYYY-MM-DD format");
  if (new Date(input.birthDate) > new Date()) return fail("birthDate cannot be in the future");
  return ok;
};

export const validateUpdatePerson = (input: UpdatePersonInput): ValidationResult =>
  validateCreatePerson(input);
