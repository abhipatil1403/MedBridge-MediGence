import Link from 'next/link';
import type { ComponentProps } from 'react';

/** Catalog pages read governed, current publication data. Fetch on navigation,
 * rather than starting many complete catalog reads for visible result links. */
export default function CatalogLink(props:ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false}/>;
}
