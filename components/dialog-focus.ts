import type { KeyboardEvent } from 'react';

/** Keep keyboard navigation in the open dialog, including at either boundary. */
export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )).filter(control => control.getClientRects().length > 0 && getComputedStyle(control).visibility !== 'hidden');
  if (!controls.length) return;
  const active = document.activeElement;
  const first = controls[0], last = controls[controls.length - 1];
  if (!controls.includes(active as HTMLElement) || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
