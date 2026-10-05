import { z } from "zod";

export const packageServiceNames = {
  procedure: "Procedure / treatment",
  hospitalStay: "Hospital stay",
  rehabilitation: "Rehabilitation",
  localTransport: "Local transportation",
  visaAssistance: "Visa assistance",
  accommodation: "Accommodation",
  transfer: "Airport transfer",
  interpreter: "Interpreter",
  consultation: "Consultation",
  diagnostics: "Diagnostics",
  followUp: "Follow-up",
} as const;
export const packageServiceSchema = z.object({
  status: z.enum(["included", "excluded", "conditional", "not_confirmed"]),
  information: z.string().nullable(),
});
export const packageServicesSchema = z.object({
  procedure: packageServiceSchema.optional(),
  hospitalStay: packageServiceSchema.optional(),
  rehabilitation: packageServiceSchema.optional(),
  localTransport: packageServiceSchema.optional(),
  visaAssistance: packageServiceSchema.optional(),
  accommodation: packageServiceSchema.optional(),
  transfer: packageServiceSchema.optional(),
  interpreter: packageServiceSchema.optional(),
  consultation: packageServiceSchema.optional(),
  diagnostics: packageServiceSchema.optional(),
  followUp: packageServiceSchema.optional(),
});
export type PackageServices = z.infer<typeof packageServicesSchema>;
