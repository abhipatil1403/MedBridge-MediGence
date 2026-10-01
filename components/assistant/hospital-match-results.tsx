import type { HospitalMatch } from '@/lib/agents/schemas';

const labels = { strong_match: 'Applicable hospital criteria documented', partial_match: 'Partial requirement match',
  insufficient_evidence: 'Insufficient evidence', does_not_match: 'Required criteria not met' };

/** Evidence overview only; sourced cards below retain the existing display/reference order. */
export function HospitalMatchResults({ matches }: { matches: HospitalMatch[] }) {
  if (!matches.length) return null;
  return <section aria-label="Hospital matching evidence" className="assistant-requirements">
    <h3>Hospital matches</h3><p>Ordered by documented requirement satisfaction within each destination. These labels do not establish clinical suitability or provider quality.</p>
    {matches.map((match) => <div key={match.hospital.provenance.recordId}>
      <h4>{match.hospital.title} · {match.classification === 'strong_match' && match.packageEvidenceRequested ? 'Hospital criteria and linked package evidence documented' : labels[match.classification]}</h4>
      <ul>{match.criteria.map(({ evaluation, level }) => <li key={evaluation.requirementId}>
        <strong>{evaluation.label}</strong>{' · '}{evaluation.status.replaceAll('_', ' ')}{level === 'package' ? ' · evaluated separately through a linked package' : level === 'hospital' ? ' · hospital evidence' : ''}
        {evaluation.status !== 'exact' && <p>{evaluation.explanation}</p>}
      </li>)}</ul>
      {match.linkedPackages.length ? <details><summary>{match.linkedPackages.length} linked package{match.linkedPackages.length === 1 ? '' : 's'}</summary>
        <ul>{match.linkedPackages.map(({ package: pkg, classification }) => <li key={pkg.provenance.recordId}>
          <strong>{pkg.title}</strong>{' · '}{classification === 'strong_match' ? 'Applicable package criteria documented' : labels[classification]}
          {pkg.provenance.recordId === match.evidencePackageId && <p>This package supplies the package evidence above. Other packages are evaluated independently.</p>}
        </li>)}</ul>
      </details> : match.packageEvidenceRequested ? <p>No sourced linked package is available{match.packageSearchComplete ? '.' : '; retrieval is incomplete.'}</p> : null}
    </div>)}
  </section>;
}
