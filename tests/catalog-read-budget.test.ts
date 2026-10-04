import { expect, it } from 'vitest';
import { catalogReadQueue } from '@/lib/catalog/read-budget';

it('bounds simultaneous catalog statements while preserving result order', async () => {
  const read = catalogReadQueue(3);
  let active = 0, maximum = 0;
  const results = await Promise.all(Array.from({ length: 21 }, (_, index) => read(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise<void>(resolve => setTimeout(resolve, 1));
    active--; return index;
  })));
  expect(maximum).toBe(3);
  expect(results).toEqual(Array.from({ length: 21 }, (_, index) => index));
});

it('propagates database failure and releases the slot without a catalog fallback', async () => {
  const read = catalogReadQueue(1);
  const failure = read(async () => { throw new Error('statement timeout'); });
  const next = read(async () => 'next statement');
  await expect(failure).rejects.toThrow('statement timeout');
  await expect(next).resolves.toBe('next statement');
});
