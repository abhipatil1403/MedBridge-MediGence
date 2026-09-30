import type { DiscoveryIntent } from "@/types/discovery";
import { normalize } from "./normalize";

export const IntentDetector = {
  detect(query: string): DiscoveryIntent {
    const text = normalize(query);
    if (/\b(compare|comparison|versus|vs)\b/.test(text) || /\bbetween\b.+\band\b/.test(text)
      || /\bwhich\b.*\b(cheaper|lower|lowest)\b.*\b(package|cost|price)\b/.test(text)) return "comparison";
    if (/\b(second opinion|another opinion|review my diagnosis)\b/.test(text)) return "second-opinion";
    if (/\b(physiotherapy|physical therapy|rehab|recovery|aftercare|post surgery)\b/.test(text)) return "recovery";
    if (/\b(visa|flight|travel|airport|accommodation|hotel|transport)\b/.test(text)) return "travel";
    if (/\b(package|bundle)\b/.test(text)) return "package";
    if (/\b(consultation|consult|appointment|telemedicine|video call)\b/.test(text)) return "consultation";
    if (/\b(hospital|hospitals|clinic|clinics|medical centre|medical center)\b/.test(text)) return "hospital";
    if (/\b(doctor|doctors|specialist|surgeon|cardiologist|oncologist|neurologist|orthopedist)\b/.test(text)) return "doctor";
    if (text) return "treatment";
    return "general-discovery";
  },
};
