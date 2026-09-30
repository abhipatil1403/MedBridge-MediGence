import type { Requirement } from './RequirementTypes';

/** Currency is preserved, never converted. Bounds retain strict/inclusive semantics. */
export function extractBudget(content: string): Requirement | undefined {
  const money = '(?:(\\$|USD|₹|INR|Rs\\.?|rupees)\\s*)?([\\d,]+(?:\\.\\d+)?)\\s*(lakh|lakhs|lac|crore|k)?\\s*(dollars|USD|INR|rupees)?';
  const range = new RegExp(`\\bbetween\\s+${money}\\s+and\\s+${money}`, 'i').exec(content);
  const bound = new RegExp(`(under|below|less than|within|at most|maximum(?: budget)?|up to|over|above|more than|at least|minimum(?: budget)?|(?:my\\s+)?budget(?:\\s+is)?(?:\\s+around|\\s+about)?|exactly)\\s*:?\\s*${money}`, 'i').exec(content)
    ?? new RegExp(`${money}\\s+budget\\b`, 'i').exec(content);
  if (!range && !bound) return undefined;
  const amount = (n: string, scale?: string) => Number(n.replaceAll(',', '')) * (/^la(?:kh|c)/i.test(scale ?? '') ? 100000 : /crore/i.test(scale ?? '') ? 10000000 : /^k$/i.test(scale ?? '') ? 1000 : 1);
  const currency = (v: string) => /₹|\b(?:inr|rs\.?|rupees)\b/i.test(v) ? 'INR' : /\$|\b(?:usd|dollars)\b/i.test(v) ? 'USD' : 'unspecified';
  if (range) {
    const a = amount(range[2], range[3]), b = amount(range[6], range[7]);
    const c1 = currency(`${range[1] ?? ''} ${range[4] ?? ''}`), c2 = currency(`${range[5] ?? ''} ${range[8] ?? ''}`);
    if (a > b || b > 100000000 || (c1 !== 'unspecified' && c2 !== 'unspecified' && c1 !== c2)) return undefined;
    return { id: 'budget', type: 'budget', label: range[0], originalExpression: range[0], required: true, currency: c1 !== 'unspecified' ? c1 : c2, minimum: a, maximum: b, operator: 'range' };
  }
  const hasOperator = /^(under|below|less|within|at most|maximum|up to|over|above|more|at least|minimum|(?:my\s+)?budget|exactly)/i.test(bound![0]);
  const offset = hasOperator ? 1 : 0;
  const n = amount(bound![2 + offset], bound![3 + offset]);
  if (!Number.isFinite(n) || n <= 0 || n > 100000000) return undefined;
  const op = hasOperator ? bound![1].toLowerCase() : 'budget';
  const operator = /^(under|below|less than)$/.test(op) ? 'lt' : /^(over|above|more than)$/.test(op) ? 'gt' : /^(at least|minimum)/.test(op) ? 'gte' : op === 'exactly' ? 'eq' : 'lte';
  return { id: 'budget', type: 'budget', label: bound![0], originalExpression: bound![0], required: true,
    currency: currency(`${bound![1 + offset] ?? ''} ${bound![4 + offset] ?? ''}`), operator,
    ...(['gt', 'gte'].includes(operator) ? { minimum: n } : operator === 'eq' ? { minimum: n, maximum: n } : { maximum: n }) };
}

export function legacyBudget(requirements: Requirement[]) {
  const budget = requirements.find((item) => item.type === 'budget');
  return budget?.maximum && budget.currency !== 'unspecified' && budget.currency ? { amount: budget.maximum, currency: budget.currency, source: 'user' as const } : undefined;
}
