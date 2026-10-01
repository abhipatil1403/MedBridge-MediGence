import type { CaseExtraction, PatientCase } from './CaseTypes';
import { caseKey, normalizeCaseTime } from './CaseNormalizer';

const time = /\b(?:last (?:month|year|week)|(?:about |approximately )?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|weeks?|months?|years?)(?:\s+ago)?|(?:in |on )?20\d{2}(?:-\d{2}-\d{2})?)\b/i;
/** Deterministic span extraction. Unsupported phrasing stays unparsed, never guessed.
 * No model sees medical text; every emitted item is anchored to a message span. */
export function extractCase(content: string, previous?: PatientCase): CaseExtraction[] {
  const output: CaseExtraction[] = [];
  const add = (field: CaseExtraction['field'], value: string, start: number, end: number, key = caseKey(value), extra?: Partial<CaseExtraction>) => {
    if (value && value.length <= 600) output.push({ field, value, key, start, end, ...extra });
  };
  // Clause boundaries stop one clinical category consuming another.
  const clauses: Array<{ 0: string; index: number }> = [];
  let from = 0;
  for (const boundary of content.matchAll(/[!?;\n]|\.(?!\d)|\s+and\s+(?=(?:I\b|I'm\b|my doctor\b|my (?:MRI|CT)\b))/gi)) {
    clauses.push({ 0: content.slice(from, boundary.index), index: from }); from = boundary.index! + boundary[0].length;
  }
  if (from < content.length) clauses.push({ 0: content.slice(from), index: from });
  for (const part of clauses) {
    const clause = part[0], offset = part.index!;
    const symptom = /\b(?:I (?:have|have had|had|am experiencing|'ve had)|I've had|I have been (?:having|experiencing)|my)\s+(.+?)(?=\s+(?:for|since|and|but)\b|$)/i.exec(clause);
    if (symptom && /\b(?:pain|hurts?|ache|aching|nausea|dizziness|fatigue|swelling|cough|fever|headache|breathlessness|numbness|vomiting)\b/i.test(symptom[1]) && !/\b(?:taking|diagnosed|allerg|MRI|scan|medication|surgery)\b/i.test(symptom[1])) {
      const original = symptom[1].trim();
      const value = /^(?:left |right )?knee hurts?$/i.test(original) ? original.replace(/hurts?$/i, 'pain') : original;
      add('symptoms', value, offset + symptom.index, offset + symptom.index + symptom[0].length,
        caseKey(value.replace(/\b(?:severe|mild|moderate|constant|intermittent|persistent|occasional)\s+/gi, '')));
    }
    const diagnosis = /\b(?:I (?:was|have been|am)|I've been|my doctor (?:has )?)\s*(?:diagnosed (?:me )?with|diagnosed me with|said I have)\s+(.+?)(?=\s+(?:in 20\d{2}|for|and|but)\b|$)/i.exec(clause);
    if (diagnosis) {
      add('reportedDiagnosis', diagnosis[1].trim(), offset + diagnosis.index, offset + diagnosis.index + diagnosis[0].length);
      if (/\bin 20\d{2}\b/.test(clause)) add('medicalHistory', diagnosis[1].trim(), offset, offset + clause.length);
    }
    const procedure = /\b(?:my |the |a )?doctor\s+(?:said (?:I (?:may |might )?(?:need|could need)|I should (?:have|consider))|mentioned|suggested|recommended|discussed)\s+(?:possible |a |an )?(.+?)(?=\s+(?:and|but)\b|$)/i.exec(clause);
    if (procedure) add('proceduresDiscussed', procedure[1].trim(), offset + procedure.index, offset + procedure.index + procedure[0].length);
    const investigation = /\b(MRI|CT(?: scan)?|X-ray|ultrasound|blood tests?|biopsy)\b/i.exec(clause);
    if (investigation && /\b(?:had|underwent|done|performed|was|showed|my)\b/i.test(clause)) {
      const finding = /\bshowed\s+(.+?)(?=\s+and\b|$)/i.exec(clause)?.[1];
      const existing = previous?.investigations.find((i) => i.key === caseKey(investigation[1]));
      if (finding || !existing?.value.includes('user-reported finding:'))
        add('investigations', `${investigation[1]}${finding ? ` — user-reported finding: ${finding.trim()}` : ''}`, offset, offset + clause.length, caseKey(investigation[1]));
    }
    const medication = /\b(?:I(?:'m| am) (?:currently )?(?:taking|on)|I take|I'm currently taking)\s+(?:some |a |an )?(.+?)(?=\s+(?:and|but)\b|$)/i.exec(clause);
    if (medication) {
      const dose = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/i.exec(medication[1])?.[0];
      const frequency = /\b(?:once|twice|three times) (?:a |per )?day\b|\bdaily\b/i.exec(medication[1])?.[0];
      const name = medication[1].replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b.*$/i, '').replace(/\b(?:once|twice|three times|daily)\b.*$/i, '').trim();
      add('medications', name, offset + medication.index, offset + medication.index + medication[0].length, caseKey(name), { dose, frequency });
    }
    const allergy = /\b(?:I(?:'m| am) allergic to|I have an? allergy to)\s+(.+?)(?=\s+(?:and|but)\b|$)/i.exec(clause);
    if (allergy) add('allergies', allergy[1].trim(), offset + allergy.index, offset + allergy.index + allergy[0].length);
    if (/\b(?:no known allergies|I (?:don't|do not) have any known allergies)\b/i.test(clause)) add('allergies', 'none reported', offset, offset + clause.length);
    const history = /\b(?:I have a history of|my medical history includes)\s+(.+?)(?=\s+and\b|$)/i.exec(clause);
    if (history) add('medicalHistory', history[1].trim(), offset + history.index, offset + history.index + history[0].length);
    const past = /\b(?:I (?:had|underwent|tried|previously had))\s+(.+?)(?=\s+(?:in 20\d{2}|last year|and)\b|$)/i.exec(clause);
    if (past && !investigation && /\b(?:surgery|physiotherapy|therapy|treatment|injections?)\b/i.test(past[1])) add('previousTreatments', past[1].trim(), offset, offset + clause.length);
    const when = time.exec(clause);
    if (when) {
      const event = investigation?.[1] ?? (diagnosis ? `Diagnosis reported: ${diagnosis[1].trim()}` : past && /\bsurgery\b/i.test(past[1]) ? past[1].trim()
        : /\b(?:MRI|CT|scan)\b/i.test(content) ? undefined
          : /\b(?:pain|going on|started|been|about)\b/i.test(clause) && (output.some((i) => i.field === 'symptoms') || previous?.symptoms.length) ? 'Symptom duration' : undefined);
      if (event) add('timeline', `${event}: ${normalizeCaseTime(when[0])}`, offset + when.index, offset + when.index + when[0].length, caseKey(event));
    }
    const goal = /\bI (?:want|would like) to\s+(.+)$/i.exec(clause);
    if (goal) add('requestedGoal', goal[1].trim(), offset + goal.index, offset + goal.index + goal[0].length);
  }
  // Explicit correction with a pronoun may use exactly one investigation, never choose among several.
  if (!output.some((i) => i.field === 'timeline') && /\b(?:actually|correction|update|correct)\b/i.test(content) && previous?.investigations.length === 1 && /\bit was\b/i.test(content)) {
    const when = time.exec(content);
    if (when) add('timeline', `${previous.investigations[0].key.toUpperCase()}: ${normalizeCaseTime(when[0])}`, when.index, when.index + when[0].length, previous.investigations[0].key);
  }
  return output;
}
