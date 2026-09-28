export function normalize(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const stopwords = new Set(["a", "an", "and", "are", "can", "do", "does", "for", "get", "help", "how", "i", "in", "is", "me", "my", "need", "of", "or", "the", "to", "us", "want", "what", "where", "with", "find", "looking", "treatment", "care", "hospital", "hospitals", "doctor", "doctors", "cost", "price", "compare", "vs", "after", "surgery"]);

export function tokens(value: string): string[] {
  return normalize(value).split(" ").filter((token) => token.length > 1 && !stopwords.has(token));
}

export function includesPhrase(query: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase) && ` ${normalize(query)} `.includes(` ${normalizedPhrase} `);
}
