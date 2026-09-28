import { describe, expect, it } from 'vitest';
import { safeReturnPath } from '@/lib/auth/return-path';

describe('email sign-in return destination', () => {
  it('keeps a local page with its search and fragment', () => {
    expect(safeReturnPath('/assistant?conversation=123#latest')).toBe('/assistant?conversation=123#latest');
  });

  it.each(['https://evil.example/path', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/auth/callback?next=/assistant', null])
    ('rejects an unsafe or looping destination: %s', (value) => {
      expect(safeReturnPath(value)).toBe('/assistant');
    });
});
