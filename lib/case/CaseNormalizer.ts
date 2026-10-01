const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
export function normalizeCaseTime(expression: string): string {
  const relative = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(days?|weeks?|months?|years?)(\s+ago)?\b/i.exec(expression);
  if (relative) return `approximately ${numbers[relative[1].toLowerCase()] ?? relative[1]} ${relative[2].toLowerCase()}${relative[3] ? ' ago' : ''}`;
  if (/\blast (month|year|week)\b/i.test(expression)) return `approximately ${expression.trim().toLowerCase()}`;
  // A year remains a year; no day/month is guessed.
  return expression.trim();
}
export function caseKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200); }
