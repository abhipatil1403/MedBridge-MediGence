import type { ParsedQuery } from "@/types/discovery";
import { EntityMatcher, type MatchCatalog } from "./entity-matcher";
import { IntentDetector } from "./intent-detector";
import { tokens } from "./normalize";

export const QueryParser = {
  parse(query: string, catalog: MatchCatalog): ParsedQuery {
    const cleanQuery = query.trim().slice(0, 240);
    return {
      query: cleanQuery,
      intent: IntentDetector.detect(cleanQuery),
      tokens: tokens(cleanQuery),
      entities: EntityMatcher.match(cleanQuery, catalog),
    };
  },
};
