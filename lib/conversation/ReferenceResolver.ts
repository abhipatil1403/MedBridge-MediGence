import { normalize } from '@/lib/discovery/normalize';
import { referenceResolutionSchema, type EntityReference, type ReferenceContext, type ReferenceQuery, type ReferenceResolution } from './schemas';
import { ReferenceDetector } from './ReferenceDetector';
import { comparisonPrice, packagePrice } from '@/lib/catalog/pricing';
import type { RateSnapshot } from '@/lib/experience/currency';

const unique = (items: EntityReference[]) => [...new Map(items.map((item) => [`${item.entityType}:${item.entityId}`, item])).values()];
const samePlace = (value: string | undefined, location: string) => Boolean(value && normalize(value.replaceAll('-', ' ')) === normalize(location));

export const ReferenceResolver = {
  resolve(input: { conversationId: string; userMessage: string; currentContext?: ReferenceContext; query?: ReferenceQuery; exchangeRates?: RateSnapshot | null }): ReferenceResolution {
    const query = input.query ?? ReferenceDetector.detect(input.userMessage) ?? { operation: 'details' };
    const context = input.currentContext?.conversationId === input.conversationId ? input.currentContext : undefined;
    const result = (status: ReferenceResolution['status'], reason: string, candidates: EntityReference[] = [], reference?: EntityReference) =>
      referenceResolutionSchema.parse({ status, reason: reason.slice(0, 600), candidates: unique(candidates).slice(0, 30), reference, query });
    if (!context) return result('unresolved', "Which result do you mean? I don't have a recent list to reference.");
    let groups = context.groups.filter((group) => !group.shared || query.entityType === group.entityType);
    if (query.sourceKind) groups = groups.map(g => ({ ...g, references: g.references.filter(r => (r.sourceKind ?? 'medbridge_catalog') === query.sourceKind) }));
    if (query.entityType) groups = groups.filter((group) => group.entityType === query.entityType);
    if (query.attribute || query.operation === 'price') groups = groups.filter((group) => group.entityType === 'package');
    if (query.location) groups = groups.map((group) => ({ ...group, references: group.references.filter((reference) =>
      samePlace(reference.location, query.location!) || samePlace(reference.city, query.location!) || samePlace(reference.country, query.location!)) }));
    const all = unique(groups.flatMap((group) => group.references));
    if (query.attribute) {
      const price = query.attribute === 'cheaper' || query.attribute === 'expensive';
      const target = all[0]?.currency ?? 'USD';
      const prices = new Map(all.map(item=>[item.entityId,comparisonPrice({...item,samplePriceUsd:item.samplePrice},target,input.exchangeRates)]));
      const valid = all.filter((item) => item.matchType === 'exact' && (price ? prices.get(item.entityId) && item.priceType !== 'starting_price' : item.durationDays !== undefined));
      const numeric = all.filter(item=>prices.get(item.entityId));
      const missingSide = groups.some((group) => group.optionPosition && (!group.references.length || group.incomplete));
      if (valid.length < 2 || valid.length !== all.length || missingSide || groups.some((group) => group.incomplete))
        return result('unresolved', price ? `I cannot determine a cheaper or more expensive package: a comparable current numeric price is missing for at least one option, currencies cannot be converted, or only a starting price is documented.${numeric.length===1 ? ` The only numeric listing${numeric[0].listedPrice===undefined&&numeric[0].samplePrice?' (synthetic sample)':''} is ${packagePrice({...numeric[0],samplePriceUsd:numeric[0].samplePrice})}.` : ''} Unpriced packages cannot be ranked. Available prices are listings, not current quotes.`
          : 'I cannot compare package duration because comparable duration data is missing for at least one option.', all);
      const values = valid.map((item) => price ? (query.attribute === 'cheaper' ? prices.get(item.entityId)!.max : prices.get(item.entityId)!.min) : item.durationDays!);
      const extreme = ['cheaper', 'shorter'].includes(query.attribute) ? Math.min(...values) : Math.max(...values);
      const candidates = valid.filter((_item, index) => values[index] === extreme);
      if (price && candidates.length === 1 && valid.some(item=>item.entityId!==candidates[0].entityId && (query.attribute==='cheaper' ? prices.get(item.entityId)!.min<extreme : prices.get(item.entityId)!.max>extreme))) return result('unresolved','Published price ranges overlap; they cannot establish a uniquely cheaper package.',all);
      return candidates.length === 1 ? result('resolved', `Resolved from the listed ${price ? `${target} prices` : 'package durations'} in the returned records only.${price ? ` ${prices.get(candidates[0].entityId)!.note}` : ''}`, candidates, candidates[0])
        : result('ambiguous', 'The listed values are tied. Which package do you mean?', candidates);
    }
    if (!all.length) return result('unresolved', query.location ? `No matching ${query.entityType ?? 'entity'} was shown for ${query.location}. Which result do you mean?`
      : 'There is no matching result in the latest result set. Which result do you mean?');
    if (query.ordinal) {
      // Typed ordinals select the displayed entity-type list across comparison sides, preserving order.
      if (query.entityType || new Set(all.map((item) => item.entityType)).size === 1) {
        const chosen = query.ordinal === 'last' ? all.at(-1) : all[query.ordinal - 1];
        return chosen ? result('resolved', 'Resolved from the actual displayed order.', [chosen], chosen)
          : result('unresolved', `I only showed ${all.length} ${query.entityType ?? all[0].entityType} result${all.length === 1 ? '' : 's'} in that list. Which one would you like to explore?`, all);
      }
      // A bare ordinal may refer to a group-local list or the complete displayed list.
      const candidates = unique([...groups.flatMap((group) => {
        const chosen = query.ordinal === 'last' ? group.references.at(-1) : group.references[(query.ordinal as number) - 1]; return chosen ? [chosen] : [];
      }), ...(query.ordinal === 'last' ? [all.at(-1)!] : all[query.ordinal - 1] ? [all[query.ordinal - 1]] : [])]);
      if (candidates.length === 1) return result('resolved', 'The relevant displayed lists identify the same entity.', candidates, candidates[0]);
      if (!candidates.length) return result('unresolved', `That position was not shown in the recent lists. Which result do you mean?`, all);
      return result('ambiguous', `Do you mean ${candidates.map((item) => `${item.entityType} ${item.displayName}`).join(' or ')}?`, candidates);
    }
    // A location-only comparison reference identifies its hospital when there is one; package and doctor references are explicit.
    const hospitals = all.filter((item) => item.entityType === 'hospital');
    const candidates = query.location && !query.entityType && hospitals.length === 1 ? hospitals : all;
    return candidates.length === 1 ? result('resolved', 'Resolved to the single matching structured result.', candidates, candidates[0])
      : result('ambiguous', `Which ${query.entityType ?? 'result'} do you mean: ${candidates.map((item) => item.displayName).join(' or ')}?`, candidates);
  },
};
