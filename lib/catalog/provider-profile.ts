import "server-only";
import { z } from "zod";
import { getPublicSupabaseClient } from "@/lib/supabase/server";
import { packageServicesSchema } from "./package-services";
const review = z.object({
  field: z.string(),
  status: z.string(),
  sourceUrl: z.string().nullable(),
  checkedAt: z.string(),
  expiresOn: z.string().nullable(),
});
const profile = z.object({
  sections: z
    .array(
      z.object({
        kind: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        department: z.string().nullable(),
        availability: z.string().nullable(),
        category: z.string().nullable(),
        eligibilityNote: z.string().nullable(),
        quantity: z.union([z.number(), z.string()]).nullable(),
        facilityType: z.string().nullable(),
      }),
    )
    .optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  yearEstablished: z.union([z.number(), z.string()]).nullable().optional(),
  locations: z
    .array(
      z.object({
        name: z.string(),
        address: z.string().nullable(),
        city: z.string().nullable(),
        phone: z.string().nullable(),
      }),
    )
    .optional(),
  accreditations: z
    .array(
      z.object({
        name: z.string(),
        body: z.string().nullable(),
        expiresOn: z.string().nullable(),
      }),
    )
    .optional(),
  internationalServices: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().nullable(),
        languages: z.array(z.string()).nullable(),
        availability: z.string().nullable().optional(),
      }),
    )
    .optional(),
  fieldReviews: z.array(review).optional(),
});
export async function publishedProviderProfile(hospitalId: string) {
  const { data, error } = await getPublicSupabaseClient().rpc(
    "public_provider_profile",
    { p_hospital_id: hospitalId },
  );
  if (error) return undefined;
  const parsed = profile.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
export async function publishedRecordProfile(
  kind: "doctor" | "package",
  id: string,
) {
  const { data, error } = await getPublicSupabaseClient().rpc(
    "public_provider_record",
    { p_kind: kind, p_id: id },
  );
  if (error) return undefined;
  const parsed = z
    .object({
      professionalTitle: z.string().nullable(),
      department: z.string().nullable(),
      terms: z.string().nullable(),
      validFrom: z.string().nullable(),
      validUntil: z.string().nullable(),
      hasImage: z.boolean(),
      notes: z.string().nullable().optional(),
      serviceDetails: packageServicesSchema.optional(),
    })
    .safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
