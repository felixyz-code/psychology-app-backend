/**
 * Immutable, request-validated ownership boundary for the Patients pilot.
 * Both fields are required for every tenant-aware patient operation.
 */
export type PatientAccessScope = Readonly<{
  organizationId: string;
  psychologistId: string;
}>;
