import { z } from "zod";
export const referenceSourceTypes = ["provider_website","provider_directory","government","regulator","recognized_organization","secondary"] as const;
export const referenceOrganizationSchema = z.object({name:z.string().trim().min(2).max(180),providerType:z.enum(["hospital","clinic","healthcare_organization"])}).strict();
export const referenceSourceSchema = z.object({
  name:z.string().trim().min(3).max(180),
  url:z.url().max(2000).refine(value => {const url = new URL(value);return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !url.pathname.includes("/storage/v1/");},"Use a public HTTPS URL without credentials, query or fragment."),
  sourceType:z.enum(referenceSourceTypes),collectedAt:z.iso.datetime({offset:true}),
  reviewAfter:z.union([z.iso.date(),z.literal("")]).optional(),notes:z.string().max(3000).optional(),
}).strict().superRefine((value,ctx)=> {
  if (Date.parse(value.collectedAt)>Date.now()+300000) ctx.addIssue({code:"custom",message:"Collection time cannot be in the future."});
  if (value.reviewAfter && value.reviewAfter < value.collectedAt.slice(0,10)) ctx.addIssue({code:"custom",message:"Review due date must follow collection."});
  if (value.sourceType === "secondary" && (value.notes?.trim().length ?? 0)<10) ctx.addIssue({code:"custom",message:"Justify using a secondary source."});
});
export const referenceClaimSchema = z.object({recordId:z.uuid(),expectedRevision:z.int().positive(),field:z.string().min(1).max(80),sourceId:z.uuid(),evidence:z.string().trim().min(10).max(3000)}).strict();
export const referenceReviewSchema = z.object({submissionId:z.uuid(),recordId:z.uuid(),expectedRevision:z.int().positive(),confirmed:z.literal(true),identityChecked:z.boolean().optional()}).strict();
