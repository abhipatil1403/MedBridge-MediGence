import type { z } from 'zod';
import type { caseSourceSchema, caseItemSchema, patientCaseSchema, caseSummarySchema, caseHandoffSchema, caseFields } from './CaseSchema';
export type CaseSource = z.infer<typeof caseSourceSchema>;
export type CaseItem = z.infer<typeof caseItemSchema>;
export type PatientCase = z.infer<typeof patientCaseSchema>;
export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type CaseHandoff = z.infer<typeof caseHandoffSchema>;
export type CaseField = typeof caseFields[number];
export interface CaseExtraction { field: CaseField; key: string; value: string; start: number; end: number; dose?: string; frequency?: string }
