// Reads retain ordinary public RLS and failures. Callers can share a queue
// across snapshots to limit total concurrent statements in this process.
export function catalogReadQueue(limit = 3) {
  let active = 0;
  const pending: Array<() => void> = [];
  return async function read<T>(operation: () => PromiseLike<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => { active++; resolve(); };
      if (active < limit) start(); else pending.push(start);
    });
    try { return await operation(); }
    finally { active--; pending.shift()?.(); }
  };
}
export const publicCatalogRead = catalogReadQueue(3);
