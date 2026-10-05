'use client';
import { createElement, type JSX } from 'react';
import { useTranslation } from './translation';
// Explicit semantic wrapper for localized interface attributes. No provider values are translated.
export function Localized<K extends keyof JSX.IntrinsicElements>({as,children,...props}:{as:K}&JSX.IntrinsicElements[K]) {
  const {t}=useTranslation();
  const attributes={...props} as Record<string,unknown>;
  for(const key of ['aria-label','title','placeholder'])if(typeof attributes[key]==='string')attributes[key]=t(attributes[key]);
  return createElement(as,attributes,children);
}
