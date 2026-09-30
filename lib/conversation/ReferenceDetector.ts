import { normalize } from '@/lib/discovery/normalize';
import { referenceQuerySchema, type ReferenceQuery } from './schemas';

const ordinalWords = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** Detect reference language, not catalog identifiers. Explicit new searches retain their normal route. */
export const ReferenceDetector = {
  detect(content: string): ReferenceQuery | undefined {
    const text = normalize(content);
    if (/\bcompare\b|\bcomparison\b|\bversus\b|\bvs\b|\bbudget\b/.test(text)
      || /which has (?:the )?cheaper package/.test(text)) return undefined;
    const ordinalMatch = /\b(?:the )?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d+(?:st|nd|rd|th))\s+(?:one|item|result|hospital|doctor|package|treatment|provider)s?\b/.exec(text);
    const location = /\bthe\s+([a-z]+(?:\s+[a-z]+){0,3}?)\s+(?:one|result)\b/.exec(text)?.[1];
    const relation = /\b(?:its|their|that hospital(?:'s|s)?|this hospital(?:'s|s)?)\s+(?:have\s+(?:a\s+)?)?packages?\b|\bdoes (?:that|this|the) hospital have (?:a )?package\b/.test(text);
    const attribute = /\b(?:cheaper|less expensive|lowest (?:price|cost))\b/.test(text) ? 'cheaper'
      : /\b(?:more expensive|highest (?:price|cost))\b/.test(text) ? 'expensive'
        : /\blonger\b/.test(text) ? 'longer' : /\bshorter\b/.test(text) ? 'shorter' : undefined;
    const demonstrative = /\b(?:this|that|these|those|its|their)\b/.test(text);
    const inclusionQuestion = /\b(?:does|do|is)\b.*\b(?:include|included|provide|cover)\b/.test(text);
    const detail = inclusionQuestion || /\b(?:tell me|more about|details?|how much|you (?:showed|mentioned))\b/.test(text);
    const typedDemonstrative = demonstrative && /\b(?:hospital|provider|doctor|package|treatment)s?\b/.test(text);
    if (!ordinalMatch && !relation && !(attribute && /\b(?:which|one|package)\b/.test(text))
      && !typedDemonstrative && !/^(?:this|that|this one|that one)$/.test(text)
      && !(detail && (demonstrative || location || inclusionQuestion && /\bit\b/.test(text) || /\bthe (?:hospital|doctor|package|treatment|provider)\b/.test(text)))) return undefined;
    const entityType = /\b(?:hospital|provider)s?\b/.test(text) ? 'hospital' : /\bdoctors?\b/.test(text) ? 'doctor'
      : /\bpackages?\b/.test(text) ? 'package' : /\btreatments?\b/.test(text) ? 'treatment' : undefined;
    const word = ordinalMatch?.[1];
    const ordinal = word === 'last' ? 'last' : word ? ordinalWords.includes(word) ? ordinalWords.indexOf(word) + 1 : parseInt(word, 10) : undefined;
    return referenceQuerySchema.parse({ ordinal, entityType: relation ? 'hospital' : entityType ?? (inclusionQuestion ? 'package' : undefined),
      location: location && !ordinalWords.includes(location) && !['last', 'cheaper', 'more expensive', 'longer', 'shorter'].includes(location) ? location : undefined,
      attribute, operation: relation ? 'packages' : /\bhow much\b/.test(text) ? 'price' : 'details' });
  },
};
