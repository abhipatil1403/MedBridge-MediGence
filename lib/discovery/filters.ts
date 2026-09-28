import { z } from "zod";
import type { DiscoveryFilters } from "@/types/discovery";

const optionalText = z.string().trim().max(80).optional();
const filterSchema = z.object({
  q: z.string().trim().max(240).default(""),
  type: z.enum(["all", "treatments", "hospitals", "doctors", "packages", "countries", "services"]).default("all"),
  specialty: optionalText,
  country: optionalText,
  city: optionalText,
  accreditation: z.enum(["sample", "none"]).optional(),
  hospital: optionalText,
  mode: z.enum(["video", "in-person"]).optional(),
  treatment: optionalText,
  budget: z.coerce.number().int().positive().max(1000000).optional(),
  sort: z.enum(["relevance", "name", "experience", "price", "location"]).default("relevance"),
});

export class InvalidDiscoveryFilters extends Error {
  constructor() { super("Some search filters are invalid. Reset the filters and try again."); }
}

export function parseDiscoveryFilters(params: URLSearchParams): DiscoveryFilters {
  const parsed = filterSchema.safeParse(Object.fromEntries([...params.keys()].filter((key) => key in filterSchema.shape).map((key) => [key, params.get(key) ?? undefined])));
  if (!parsed.success) throw new InvalidDiscoveryFilters();
  return parsed.data;
}
