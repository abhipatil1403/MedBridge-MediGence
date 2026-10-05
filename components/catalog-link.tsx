import Link from 'next/link';
import type { ComponentProps } from 'react';

/** Catalog pages read governed, current publication data. Fetch on navigation,
 * rather than starting many complete catalog reads for visible result links. */
export default function CatalogLink(props:ComponentProps<typeof Link>) {
  const lightweight=typeof props.href==='string'&&/^\/(assistant|account|help|recover|consultation|second-opinion|medical-travel)(?:[?#]|$)/.test(props.href)&&!/[?&]package=/.test(props.href);
  return <Link {...props} prefetch={props.prefetch??(lightweight?undefined:false)}/>;
}
