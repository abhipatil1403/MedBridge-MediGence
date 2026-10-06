/** Typographic identity derived from the published name; never provider photography. */
export function IdentityArt({ name, kind = 'hospital' }: { name: string; kind?: 'hospital' | 'doctor' }) {
  const initials = name.split(/\s+/).filter(part => !['Dr.', 'Dr', 'Hospital', 'Hospitals', 'Super', 'Speciality'].includes(part)).slice(0, 2).map(part => part[0]).join('');
  return <div className={`identity-art identity-art--${kind}`} aria-hidden="true"><svg viewBox="0 0 400 320" fill="none"><path d="M40 320V168a160 160 0 0 1 320 0v152M70 320V174a130 130 0 0 1 260 0v146M100 320V180a100 100 0 0 1 200 0v140"/><path d="M0 260h400M0 290h400"/></svg><span>{initials}</span></div>;
}
