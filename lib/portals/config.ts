import { z } from "zod";

export const portalSchema = z.enum(["provider", "support", "admin", "patient"]);
export type Portal = z.infer<typeof portalSchema>;
export const recordKinds = [
  "organization",
  "location",
  "specialty",
  "treatment",
  "doctor",
  "facility",
  "accreditation",
  "package",
  "international_service",
] as const;
export type RecordKind = (typeof recordKinds)[number];
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "email"
    | "url"
    | "number"
    | "date"
    | "list"
    | "select"
    | "checkbox";
  options?: readonly string[];
  catalog?: string;
  catalogParams?: Record<string, string>;
  min?: number;
  help?: string;
};
export const fields: Record<RecordKind, Field[]> = {
  organization: [
    { key: "legalName", label: "Legal name" },
    {
      key: "providerType",
      label: "Provider type",
      type: "select",
      options: ["hospital", "clinic", "healthcare_organization"],
    },
    { key: "description", label: "Overview", type: "textarea" },
    {
      key: "yearEstablished",
      label: "Year established",
      type: "number",
      min: 1800,
    },
    {
      key: "website",
      label: "Official website",
      type: "url",
      help: "Use an HTTPS website you are authorized to represent.",
    },
    { key: "email", label: "Contact email", type: "email" },
    { key: "phone", label: "Contact phone" },
    { key: "contactName", label: "Contact person" },
    { key: "address", label: "Address", type: "textarea" },
    {
      key: "cityId",
      label: "City / country",
      type: "select",
      catalog: "cities",
    },
    { key: "state", label: "State" },
    { key: "postalCode", label: "Postal code" },
  ],
  location: [
    { key: "address", label: "Address", type: "textarea" },
    {
      key: "cityId",
      label: "City / country",
      type: "select",
      catalog: "cities",
    },
    { key: "state", label: "State" },
    { key: "postalCode", label: "Postal code" },
    { key: "phone", label: "Phone" },
    { key: "services", label: "Services", type: "list" },
    { key: "facilities", label: "Facilities", type: "list" },
  ],
  specialty: [
    {
      key: "specialtyId",
      label: "Canonical specialty",
      type: "select",
      catalog: "specialties",
    },
    { key: "department", label: "Department" },
    { key: "description", label: "Provider information", type: "textarea" },
    {
      key: "treatmentIds",
      label: "Related treatments",
      type: "list",
      catalog: "treatments",
    },
  ],
  treatment: [
    { key: "category", label: "Provider category" },
    {
      key: "availability",
      label: "Availability",
      type: "select",
      options: ["available", "on_request", "unavailable", "not_confirmed"],
    },
    {
      key: "treatmentId",
      label: "Canonical treatment",
      type: "select",
      catalog: "treatments",
    },
    {
      key: "description",
      label: "Provider-specific information",
      type: "textarea",
    },
    {
      key: "eligibilityNote",
      label: "Eligibility / limitations",
      type: "textarea",
    },
  ],
  doctor: [
    {
      key: "documentIds",
      label: "Supporting credentials",
      type: "list",
      catalog: "provider_documents",
    },
    {
      key: "specialtyId",
      label: "Primary specialty",
      type: "select",
      catalog: "specialties",
    },
    { key: "department", label: "Department" },
    { key: "professionalTitle", label: "Professional title" },
    { key: "credentials", label: "Credentials", type: "textarea" },
    {
      key: "experienceYears",
      label: "Years of experience",
      type: "number",
      min: 0,
    },
    { key: "languages", label: "Languages", type: "list" },
    {
      key: "consultationMode",
      label: "Consultation mode",
      type: "select",
      options: ["video", "in-person", "both"],
    },
    { key: "biography", label: "Biography", type: "textarea" },
    {
      key: "locationIds",
      label: "Associated locations",
      type: "list",
      catalog: "provider_records",
      catalogParams: { kind: "location" },
      help: "Choose locations in this organization. Hold Ctrl or Command to select several.",
    },
    {
      key: "treatmentIds",
      label: "Associated treatments",
      type: "list",
      catalog: "treatments",
      help: "Choose canonical treatments. Hold Ctrl or Command to select several.",
    },
    {
      key: "imageDocumentId",
      label: "Profile image",
      type: "select",
      catalog: "provider_documents",
      catalogParams: { status: "approved", documentKind: "profile_image" },
    },
  ],
  facility: [
    {
      key: "availability",
      label: "Availability",
      type: "select",
      options: ["available", "on_request", "unavailable", "not_confirmed"],
    },
    {
      key: "documentIds",
      label: "Supporting evidence",
      type: "list",
      catalog: "provider_documents",
    },
    {
      key: "facilityType",
      label: "Facility type",
      type: "select",
      options: [
        "beds",
        "icu",
        "operating_theatres",
        "diagnostics",
        "pharmacy",
        "rehabilitation",
        "emergency",
        "other",
      ],
    },
    {
      key: "quantity",
      label: "Quantity (if applicable)",
      type: "number",
      min: 0,
    },
    {
      key: "description",
      label: "Actual facilities / availability",
      type: "textarea",
    },
  ],
  accreditation: [
    { key: "body", label: "Accreditation body" },
    { key: "certificateNumber", label: "Certificate number" },
    { key: "issuedOn", label: "Issue date", type: "date" },
    { key: "expiresOn", label: "Expiry date", type: "date" },
    {
      key: "documentId",
      label: "Supporting certificate",
      type: "select",
      catalog: "provider_documents",
    },
    { key: "sourceUrl", label: "Authoritative source", type: "url" },
  ],
  package: [
    {
      key: "treatmentId",
      label: "Treatment",
      type: "select",
      catalog: "treatments",
    },
    { key: "description", label: "Description", type: "textarea" },
    { key: "locationId", label: "Package location", type: "select", catalog: "provider_records", catalogParams: { kind: "location" }, help: "Choose this organization's exact branch. If omitted, the published organization location applies." },
    { key: "priceType", label: "Pricing type", type: "select", options: ["package_price", "starting_price", "estimate", "published_price", "contact_provider", "not_published"], help: "Use the source's terminology. Leave amounts empty for contact-provider or unpublished pricing." },
    { key: "price", label: "Original price / range minimum", type: "number", min: 0 },
    { key: "priceMax", label: "Range maximum (only if documented)", type: "number", min: 0 },
    {
      key: "currency",
      label: "Currency",
      type: "select",
      options: ["USD", "INR", "EUR", "GBP", "AED", "AUD", "CAD", "THB", "SGD", "MYR", "TRY"],
    },
    { key: "durationDays", label: "Duration (days)", type: "number", min: 1 },
    { key: "priceSourceUrl", label: "Price source URL", type: "url" },
    { key: "priceSourceName", label: "Price source name" },
    { key: "priceCheckedAt", label: "Price source checked", type: "date" },
    { key: "priceValidFrom", label: "Price valid from", type: "date" },
    { key: "priceValidUntil", label: "Price valid until", type: "date" },
    { key: "inclusions", label: "Explicit inclusions", type: "list" },
    { key: "exclusions", label: "Explicit exclusions", type: "list" },
    ...(
      [
        ["procedure", "Procedure / treatment"],
        ["hospitalStay", "Hospital stay"],
        ["rehabilitation", "Rehabilitation"],
        ["localTransport", "Local transportation"],
        ["visaAssistance", "Visa assistance"],
        ["accommodation", "Accommodation"],
        ["transfer", "Airport transfer"],
        ["interpreter", "Interpreter"],
        ["consultation", "Consultation"],
        ["diagnostics", "Diagnostics"],
        ["followUp", "Follow-up"],
      ] as const
    ).flatMap(([key, name]): Field[] => [
      {
        key: `${key}Status`,
        label: `${name} inclusion`,
        type: "select",
        options: ["included", "excluded", "conditional", "not_confirmed"],
      },
      {
        key: `${key}Info`,
        label: `${name} information`,
        type: "textarea",
        help: "Describe the actual service, limits and extra charges. Leave empty if not documented.",
      },
    ]),
    { key: "notes", label: "Published package notes", type: "textarea" },
    { key: "validFrom", label: "Valid from", type: "date" },
    { key: "validUntil", label: "Valid until", type: "date" },
    { key: "terms", label: "Terms and limitations", type: "textarea" },
    {
      key: "documentIds",
      label: "Supporting documents",
      type: "list",
      catalog: "provider_documents",
      catalogParams: { status: "approved" },
      help: "Hold Ctrl or Command to select several approved documents.",
    },
  ],
  international_service: [
    {
      key: "serviceType",
      label: "Service",
      type: "select",
      options: [
        "international_patient_desk",
        "airport_transfer",
        "accommodation_assistance",
        "interpreter",
        "visa_assistance",
        "travel_coordination",
        "teleconsultation",
        "other",
      ],
    },
    { key: "languages", label: "Languages", type: "list" },
    {
      key: "description",
      label: "Availability and limitations",
      type: "textarea",
    },
    {
      key: "included",
      label: "Included without an additional charge",
      type: "checkbox",
    },
  ],
};
export const providerSections = [
  ["dashboard", "Dashboard"],
  ["onboarding", "My organization"],
  ["profile", "Profile"],
  ["locations", "Locations"],
  ["specialties", "Departments & specialties"],
  ["treatments", "Treatments & procedures"],
  ["doctors", "Doctors"],
  ["facilities", "Facilities"],
  ["accreditations", "Accreditations"],
  ["packages", "Packages"],
  ["pricing", "Pricing"],
  ["international", "International services"],
  ["documents", "Documents"],
  ["submissions", "Submissions"],
  ["verification", "Verification"],
  ["preview", "Public preview"],
  ["messages", "Messages"],
  ["notifications", "Notifications"],
  ["activity", "Activity"],
  ["team", "Team members"],
  ["settings", "Settings"],
] as const;
export const supportSections = [
  ["dashboard", "Dashboard"],
  ["cases", "Cases"],
  ["queue", "My queue"],
  ["all-cases", "All cases"],
  ["escalated", "Escalated"],
  ["users", "Users"],
  ["providers", "Providers"],
  ["documents", "Documents"],
  ["tasks", "Tasks"],
  ["messages", "Messages"],
  ["activity", "Activity"],
  ["notifications", "Notifications"],
  ["team", "Team workload"],
  ["settings", "Settings"],
] as const;
export const adminSections = [
  ["dashboard", "Dashboard"],
  ["reference-data", "Reference data"],
  ["users", "Users & roles"],
  ["providers", "Providers"],
  ["applications", "Provider applications"],
  ["submissions", "Submissions"],
  ["hospitals", "Hospitals"],
  ["doctors", "Doctors"],
  ["treatments", "Treatments"],
  ["packages", "Packages"],
  ["specialties", "Specialties"],
  ["countries", "Countries"],
  ["cities", "Cities"],
  ["services", "Services"],
  ["verification", "Verification"],
  ["cases", "Support cases"],
  ["documents", "Documents"],
  ["messages", "Messages"],
  ["audit", "Audit logs"],
  ["analytics", "Analytics"],
  ["notifications", "Notifications"],
  ["settings", "Platform settings"],
] as const;
export const sectionKind: Record<string, RecordKind> = {
  profile: "organization",
  locations: "location",
  specialties: "specialty",
  treatments: "treatment",
  doctors: "doctor",
  facilities: "facility",
  accreditations: "accreditation",
  packages: "package",
  pricing: "package",
  international: "international_service",
};
export const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
export function portalAllowed(portal: Portal, role: string | null) {
  return (
    portal === "provider" ||
    portal === "patient" ||
    (portal === "admin"
      ? ["admin", "super_admin"].includes(role ?? "")
      : ["support_agent", "support_manager", "admin", "super_admin"].includes(
          role ?? "",
        ))
  );
}
export const recordDataSchema = z.record(
  z.string().max(80),
  z.union([
    z.string().max(10000),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().max(500)).max(100),
    z.null(),
  ]),
);
export const recordInputSchema = z
  .object({
    organizationId: z.uuid(),
    recordId: z.uuid().optional(),
    expectedRevision: z.int().positive().optional(),
    kind: z.enum(recordKinds),
    name: z.string().trim().min(2).max(180),
    data: recordDataSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "package") {
      const { price, priceMax, priceType, currency, priceValidFrom, priceValidUntil } = value.data;
      if (["contact_provider", "not_published"].includes(String(priceType)) && (price != null || priceMax != null)) ctx.addIssue({ code: "custom", path: ["data", "price"], message: "Leave numeric amounts empty when no price is published." });
      if (typeof priceMax === "number" && (typeof price !== "number" || priceMax < price)) ctx.addIssue({ code: "custom", path: ["data", "priceMax"], message: "A price range must have a minimum and a maximum no lower than the minimum." });
      if (price !== undefined && currency !== undefined && !/^[A-Z]{3}$/.test(String(currency))) ctx.addIssue({ code: "custom", path: ["data", "currency"], message: "Use the documented original currency." });
      if (priceValidFrom && priceValidUntil && String(priceValidUntil) < String(priceValidFrom)) ctx.addIssue({ code: "custom", path: ["data", "priceValidUntil"], message: "Price validity end must follow its start." });
    }
    if (value.recordId && !value.expectedRevision)
      ctx.addIssue({
        code: "custom",
        message: "Reload the current revision before editing.",
      });
    for (const field of fields[value.kind]) {
      const entry = value.data[field.key];
      if (entry === undefined || entry === "" || entry === null) continue;
      if (
        field.type === "number" &&
        (typeof entry !== "number" || entry < (field.min ?? 0))
      )
        ctx.addIssue({
          code: "custom",
          path: ["data", field.key],
          message: `${field.label} must be ${field.min ?? 0} or greater.`,
        });
      if (field.type === "list" && !Array.isArray(entry))
        ctx.addIssue({
          code: "custom",
          path: ["data", field.key],
          message: "Enter one item per line.",
        });
      if (field.options && !field.options.includes(String(entry)))
        ctx.addIssue({
          code: "custom",
          path: ["data", field.key],
          message: "Choose a listed value.",
        });
      if (field.type === "url" && !z.url().safeParse(entry).success)
        ctx.addIssue({
          code: "custom",
          path: ["data", field.key],
          message: "Enter a valid HTTPS URL.",
        });
      if (field.type === "url" && !String(entry).startsWith("https://"))
        ctx.addIssue({
          code: "custom",
          path: ["data", field.key],
          message: "Use HTTPS.",
        });
    }
  });
export type PortalContext = {
  userId: string;
  role: string | null;
  email?: string;
  organizations: {
    id: string;
    name: string;
    role: string;
    status: string;
    sourceKind: string;
  }[];
};
export type Row = Record<string, unknown> & {
  id?: string;
  name?: string;
  status?: string;
  revision?: number;
  data?: Record<string, unknown>;
};
