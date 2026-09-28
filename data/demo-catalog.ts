import type { Country, Doctor, Hospital, Package, Service, Treatment } from "@/types/catalog";

/** Synthetic catalog for discovery development. None of these are real provider records or live prices. */
const treatmentSeeds = [
  ["knee-replacement", "Knee Replacement", "Orthopedics", "Joint care", "knee surgery|knee joint replacement|total knee replacement", "A procedure category involving replacement of damaged knee joint surfaces."],
  ["hip-replacement", "Hip Replacement", "Orthopedics", "Joint care", "hip surgery|total hip replacement", "A procedure category involving replacement of damaged hip joint surfaces."],
  ["cabg", "Coronary Artery Bypass Surgery", "Cardiology", "Heart care", "cabg|heart bypass|bypass surgery", "Surgical care intended to improve blood flow around narrowed coronary arteries."],
  ["kidney-transplant", "Kidney Transplant", "Transplant", "Transplant care", "renal transplant|kidney surgery", "A transplant pathway that requires specialist evaluation, donor assessment, and long-term follow-up."],
  ["bone-marrow-transplant", "Bone Marrow Transplant", "Oncology", "Transplant care", "stem cell transplant|bmt", "A specialist treatment pathway involving blood-forming stem cells."],
  ["brain-and-spine-surgery", "Brain & Spine Surgery", "Neurology", "Neurosurgical care", "spine surgery|brain surgery|neurosurgery", "A broad category of operations involving the brain, spinal cord, or spine."],
  ["cancer-treatment", "Cancer Treatment", "Oncology", "Cancer care", "oncology|cancer care|tumor treatment", "Cancer care may involve several disciplines and treatment approaches."],
  ["fertility-treatment", "Fertility Treatment", "Fertility", "Reproductive care", "infertility treatment|fertility care", "A pathway for evaluating fertility concerns and available care options."],
  ["knee-arthroscopy", "Knee Arthroscopy", "Orthopedics", "Joint care", "keyhole knee surgery|arthroscopic knee surgery", "A minimally invasive procedure category used to examine or treat some knee problems."],
  ["spinal-fusion", "Spinal Fusion", "Neurology", "Spine care", "spine fusion|back fusion", "A surgical category intended to join selected spinal bones."],
  ["heart-valve-replacement", "Heart Valve Replacement", "Cardiology", "Heart care", "valve surgery|cardiac valve replacement", "A procedure category for replacing a heart valve when clinically indicated."],
  ["cataract-surgery", "Cataract Surgery", "Ophthalmology", "Eye care", "cataract removal|eye lens surgery", "A procedure category for removing a cloudy natural lens and placing an artificial lens."],
  ["liver-transplant", "Liver Transplant", "Transplant", "Transplant care", "hepatic transplant", "A complex transplant pathway requiring eligibility assessment and long-term care."],
  ["chemotherapy", "Chemotherapy", "Oncology", "Cancer care", "chemo|cancer medicine", "A medicine-based cancer treatment category with regimens tailored by oncology teams."],
  ["radiation-therapy", "Radiation Therapy", "Oncology", "Cancer care", "radiotherapy|cancer radiation", "A cancer treatment category that uses carefully planned radiation doses."],
  ["ivf", "In Vitro Fertilization", "Fertility", "Reproductive care", "ivf|test tube baby", "A fertility treatment pathway involving laboratory fertilization and embryo transfer."],
  ["robotic-prostatectomy", "Robotic Prostatectomy", "Urology", "Urologic care", "prostate surgery|robotic prostate surgery", "A surgical approach to prostate removal in selected clinical circumstances."],
  ["stroke-rehabilitation", "Stroke Rehabilitation", "Rehabilitation", "Recovery care", "stroke rehab|post stroke therapy", "A coordinated rehabilitation pathway after stroke."],
  ["physiotherapy-after-surgery", "Physiotherapy After Surgery", "Rehabilitation", "Recovery care", "physiotherapy|physical therapy|post surgery rehab|knee rehabilitation", "Therapist-guided movement and function support after an operation."],
  ["dental-implants", "Dental Implants", "Dental", "Dental care", "tooth implants|implant dentistry", "A restorative dental treatment category involving replacement tooth supports."],
] as const;

const allCountrySlugs = ["india", "turkey", "thailand", "united-arab-emirates", "singapore", "malaysia", "united-kingdom", "germany", "south-korea", "egypt"] as const;

const countrySeeds: readonly (readonly [string, string, string, number])[] = [
  ["india", "India", "IN", 0.83], ["turkey", "Turkey", "TR", 1.08],
  ["thailand", "Thailand", "TH", 1.16], ["united-arab-emirates", "United Arab Emirates", "AE", 1.38],
  ["singapore", "Singapore", "SG", 1.62], ["malaysia", "Malaysia", "MY", 1.12],
  ["united-kingdom", "United Kingdom", "GB", 1.76], ["germany", "Germany", "DE", 1.71],
  ["south-korea", "South Korea", "KR", 1.43], ["egypt", "Egypt", "EG", 0.94],
];

export const demoCountries: readonly Country[] = countrySeeds.map(([slug, name, code, multiplier]) => ({
  slug, name, code, sampleCostMultiplier: multiplier, demo: true as const,
  description: `Explore sample treatment, provider, and travel information for ${name}.`,
  aliases: slug === "united-arab-emirates" ? ["uae", "dubai"] : slug === "united-kingdom" ? ["uk", "britain"] : [],
  travelNote: `Travel requirements for ${name} must be checked with official authorities before planning.`,
}));

export const demoTreatments: readonly Treatment[] = treatmentSeeds.map(([slug, name, specialty, category, aliases, description], index) => ({
  slug, name, specialty, category, description, aliases: aliases.split("|"), demo: true as const,
  overview: `${description} This sample page organizes questions and options; a qualified clinician must assess individual suitability.`,
  procedure: `The exact approach to ${name.toLowerCase()} depends on the patient's condition, investigations, and specialist review. This is an overview of the care category, not a treatment plan.`,
  indications: `A referral or existing diagnosis may prompt discussion of ${name.toLowerCase()}. A clinician should review symptoms, history, and alternatives.`,
  diagnostics: "Assessment may involve a clinical examination and condition-specific reports or imaging. Ask the treating team which records are required.",
  recovery: "Recovery time and follow-up vary by person and treatment. Discuss expected stay, rehabilitation, medication, and warning signs with the treating team.",
  typicalStayDays: 4 + (index % 8),
  sampleBaseCostUsd: 3200 + index * 1250,
  countries: allCountrySlugs.slice(index % 3, 8 + (index % 3)),
  faqs: [
    { question: `How can I compare options for ${name}?`, answer: "Compare the proposed care plan, provider capability, total estimated cost, likely stay, and follow-up arrangements. Ask a qualified specialist which factors matter for your case." },
    { question: "Is the displayed cost a quote?", answer: "No. All values in this demonstration are sample estimates. A provider must issue a current, case-specific quote." },
  ],
}));

const hospitalSeeds = [
  ["demo-care-delhi", "MedBridge Demo Centre · Delhi", "New Delhi", "india"],
  ["demo-care-mumbai", "MedBridge Demo Centre · Mumbai", "Mumbai", "india"],
  ["demo-care-bengaluru", "MedBridge Demo Centre · Bengaluru", "Bengaluru", "india"],
  ["demo-care-istanbul", "MedBridge Demo Centre · Istanbul", "Istanbul", "turkey"],
  ["demo-care-ankara", "MedBridge Demo Centre · Ankara", "Ankara", "turkey"],
  ["demo-care-bangkok", "MedBridge Demo Centre · Bangkok", "Bangkok", "thailand"],
  ["demo-care-chiang-mai", "MedBridge Demo Centre · Chiang Mai", "Chiang Mai", "thailand"],
  ["demo-care-dubai", "MedBridge Demo Centre · Dubai", "Dubai", "united-arab-emirates"],
  ["demo-care-abu-dhabi", "MedBridge Demo Centre · Abu Dhabi", "Abu Dhabi", "united-arab-emirates"],
  ["demo-care-singapore", "MedBridge Demo Centre · Singapore", "Singapore", "singapore"],
  ["demo-care-kuala-lumpur", "MedBridge Demo Centre · Kuala Lumpur", "Kuala Lumpur", "malaysia"],
  ["demo-care-london", "MedBridge Demo Centre · London", "London", "united-kingdom"],
  ["demo-care-berlin", "MedBridge Demo Centre · Berlin", "Berlin", "germany"],
  ["demo-care-seoul", "MedBridge Demo Centre · Seoul", "Seoul", "south-korea"],
  ["demo-care-cairo", "MedBridge Demo Centre · Cairo", "Cairo", "egypt"],
] as const;

export const demoHospitals: readonly Hospital[] = hospitalSeeds.map(([slug, name, city, country], index) => {
  const available = demoTreatments.filter((_, treatmentIndex) => (treatmentIndex + index) % 3 !== 0).slice(0, 12);
  return {
    slug, name, city, country, demo: true as const,
    description: `Synthetic provider record in ${city} for testing discovery and coordination flows.`,
    aliases: [city.toLowerCase(), "demo hospital"],
    specialties: [...new Set(available.map((item) => item.specialty))],
    treatmentSlugs: available.map((item) => item.slug),
    sampleBedCount: 160 + index * 24,
    sampleAccreditation: index % 3 === 0 ? "No sample credential" : "Sample credential listed",
    verification: "Demo — unverified" as const,
    infrastructure: ["Sample inpatient unit", "Sample diagnostic service", "Sample international patient desk"],
  };
});

export const demoDoctors: readonly Doctor[] = Array.from({ length: 30 }, (_, index) => {
  const hospital = demoHospitals[index % demoHospitals.length];
  const treatment = demoTreatments[(index * 3) % demoTreatments.length];
  const related = demoTreatments.filter((item) => item.specialty === treatment.specialty).slice(0, 4);
  const number = String(index + 1).padStart(2, "0");
  return {
    slug: `demo-clinician-${number}`, name: `Demo Clinician ${number}`,
    description: `Synthetic ${treatment.specialty.toLowerCase()} profile for exploring consultation options.`,
    aliases: [treatment.specialty.toLowerCase(), ...treatment.aliases], demo: true as const,
    specialty: treatment.specialty, hospitalSlug: hospital.slug, hospitalName: hospital.name, city: hospital.city, country: hospital.country,
    sampleExperienceYears: 6 + ((index * 3) % 22),
    languages: index % 4 === 0 ? ["English", "Hindi"] : index % 4 === 1 ? ["English", "Turkish"] : ["English"],
    consultationMode: index % 3 === 0 ? "video" : index % 3 === 1 ? "in-person" : "both",
    treatmentSlugs: related.map((item) => item.slug),
    verification: "Demo — unverified" as const,
    qualifications: ["No credential evidence is attached to this demo profile."],
  };
});

export const demoPackages: readonly Package[] = Array.from({ length: 15 }, (_, index) => {
  const treatment = demoTreatments[index];
  const eligibleHospitals = demoHospitals.filter((item) => item.treatmentSlugs.includes(treatment.slug));
  const hospital = eligibleHospitals[index % eligibleHospitals.length];
  return {
    slug: `sample-${treatment.slug}-${index + 1}`, name: `${treatment.name} · sample care package`,
    description: `Illustrative package structure for ${treatment.name.toLowerCase()}; no offer or reservation is available.`,
    aliases: [treatment.name.toLowerCase(), ...treatment.aliases], demo: true as const,
    treatmentSlug: treatment.slug, hospitalSlug: hospital.slug, hospitalName: hospital.name, country: hospital.country,
    durationDays: treatment.typicalStayDays + 3,
    samplePriceUsd: treatment.sampleBaseCostUsd + 1500 + index * 110,
    inclusions: ["Illustrative hospital stay", "Illustrative procedure coordination", "Illustrative discharge planning"],
    exclusions: ["Flights", "Visa fees", "Unplanned investigations or extended stay"],
    benefits: ["Shows how an itemized offer could be compared", "Separates included and excluded services"],
  };
});

export const demoServices: readonly Service[] = [
  ["second-opinion", "Second Opinion", "/second-opinion", "plan", "independent specialist review|medical second opinion", ["Describe the question you want reviewed", "Collect relevant records", "Request professional review"]],
  ["video-consultation", "Video Consultation", "/consultation", "plan", "online doctor|teleconsultation|consult a doctor", ["Find a clinician", "Review consultation options", "Prepare records and questions"]],
  ["treatment-planning", "Treatment Planning", "/treatment-plan", "plan", "treatment plan|care plan", ["Identify the treatment question", "Compare providers and destinations", "Prepare a case-specific plan request"]],
  ["medical-visa-guidance", "Medical Visa Guidance", "/medical-travel", "treat", "medical visa|visa", ["Check official requirements", "Prepare supporting records", "Coordinate travel timing"]],
  ["travel-coordination", "Travel Coordination", "/medical-travel", "treat", "flights|medical travel|travel", ["Confirm care dates", "Compare travel needs", "Coordinate confirmed arrangements"]],
  ["airport-transfer-planning", "Airport Transfer Planning", "/medical-travel", "treat", "airport transfer|transport", ["Confirm arrival details", "Identify mobility needs", "Request a transfer option"]],
  ["accommodation-support", "Accommodation Support", "/medical-travel", "treat", "hotel|accommodation|stay", ["Estimate stay length", "Identify companion needs", "Compare suitable accommodation"]],
  ["recovery-planning", "Recovery Planning", "/recovery", "recover", "aftercare|recovery plan", ["Review discharge guidance", "Organize follow-up", "Track the agreed plan"]],
  ["rehabilitation", "Rehabilitation", "/recovery", "recover", "physiotherapy|physical therapy|rehab", ["Identify rehabilitation goals", "Find suitable support", "Coordinate follow-up"]],
  ["care-coordination", "Care Coordination", "/treatment-plan", "treat", "hospital coordination|patient coordinator", ["Bring information together", "Track decisions and tasks", "Prepare the next handoff"]],
].map(([slug, name, href, category, aliases, steps]) => ({
  slug: slug as string, name: name as string, href: href as string, category: category as Service["category"],
  description: `Explore the ${String(name).toLowerCase()} pathway and what information is needed to proceed.`,
  aliases: String(aliases).split("|"), steps: steps as readonly string[], demo: true as const,
}));
