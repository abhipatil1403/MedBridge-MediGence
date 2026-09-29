import type { ParsedQuery } from "@/types/discovery";
import type { MatchCatalog } from "./entity-matcher";
import { QueryNormalizer } from './query-normalizer';
import { tokens } from "./normalize";

export const QueryParser = {
  parse(query: string, catalog: MatchCatalog): ParsedQuery {
    const cleanQuery = query.trim().slice(0, 240);
    const normalized = QueryNormalizer.normalize(cleanQuery, catalog);
    return {
      query: cleanQuery,
      intent: normalized.intent as ParsedQuery['intent'],
      tokens: tokens(cleanQuery),
      entities: normalized.entities,
    };
  },
};
