import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import type { HospitalMatch } from '@/lib/agents/schemas';

const labels = { strong_match: 'Applicable hospital criteria documented', partial_match: 'Partial requirement match',
  insufficient_evidence: 'Insufficient evidence', does_not_match: 'Required criteria not met' };

/** Evidence overview only; sourced cards below retain the existing display/reference order. */
export function HospitalMatchResults({ matches }: { matches: HospitalMatch[] }) {
  if (!matches.length) return null;
  return <Localized as="section" aria-label="Hospital matching evidence" className="assistant-requirements">
    <h3><T>{"Hospital matches"}</T></h3><p><T>{"Ordered by documented requirement satisfaction within each destination. These labels do not establish clinical suitability or provider quality."}</T></p>
    {matches.map((match) => <div key={match.hospital.provenance.recordId}>
      <h4>{match.hospital.title} · {match.classification === 'strong_match' && match.packageEvidenceRequested ? 'Hospital criteria and linked package evidence documented' : labels[match.classification]}</h4>
      <ul>{match.criteria.map(({ evaluation, level }) => <li key={evaluation.requirementId}>
        <strong>{evaluation.label}</strong>{' · '}{evaluation.status.replaceAll('_', ' ')}<T>{level === 'package' ? ' · evaluated separately through a linked package' : level === 'hospital' ? ' · hospital evidence' : ''}</T>
        {evaluation.status !== 'exact' && <p>{evaluation.explanation}</p>}
      </li>)}</ul>
      {match.linkedPackages.length ? <details><summary>{match.linkedPackages.length} <T>{"linked package"}</T><T>{match.linkedPackages.length === 1 ? '' : 's'}</T></summary>
        <ul>{match.linkedPackages.map(({ package: pkg, classification }) => <li key={pkg.provenance.recordId}>
          <strong>{pkg.title}</strong>{' · '}{classification === 'strong_match' ? 'Applicable package criteria documented' : labels[classification]}
          {pkg.provenance.recordId === match.evidencePackageId && <p><T>{"This package supplies the package evidence above. Other packages are evaluated independently."}</T></p>}
        </li>)}</ul>
      </details> : match.packageEvidenceRequested ? <p><T>{"No sourced linked package is available"}</T><T>{match.packageSearchComplete ? '.' : '; retrieval is incomplete.'}</T></p> : null}
    </div>)}
  </Localized>;
}
