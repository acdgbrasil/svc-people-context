// Response types for test assertions — mirrors the API envelope pattern.
// Uses Record<string, unknown> with explicit field access via cast.
// NO `any` — per TS handbook, always use `unknown` and narrow.

export type ApiResponse = {
  readonly data: unknown;
  readonly meta: { readonly timestamp: string; readonly [k: string]: unknown };
  readonly [k: string]: unknown;
};

export type IdData = { readonly id: string };
export type PersonData = { readonly fullName: string; readonly cpf: string | null; readonly birthDate: string };
export type RoleData = { readonly id: string; readonly system: string; readonly role: string };

export const parseJson = async (res: Response): Promise<ApiResponse> =>
  res.json() as Promise<ApiResponse>;

export const dataAs = <T>(body: ApiResponse): T => body.data as T;
export const dataAsArray = <T>(body: ApiResponse): T[] => body.data as T[];
