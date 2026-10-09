"use client";

import { useState } from "react";
import { T } from '@/components/experience/translation';
import type { Row } from '@/lib/portals/config';
import { networkNextStep, type NetworkReadiness } from '@/lib/portals/network';
import { CommandForm } from './command-form';
import { date, ErrorPanel, Loading, Panel, ResourceTable, Status, usePortal, useResource } from './core';

const confirmation = { key: 'confirmed', label: 'I reviewed and confirm this action', type: 'checkbox' as const };
const reason = { key: 'reason', label: 'Review reason', type: 'textarea' as const };

/** Readiness contains no evidence, contact information or internal review prose. */
export function OrganizationActivation({ compact = false }: { compact?: boolean }) {
  const { organizationId, portal, context } = usePortal();
  const { data, error, loading } = useResource<{ rows: NetworkReadiness[] }>('network_readiness', { organizationId });
  const row = data?.rows[0];
  const admin = portal === 'admin';
  const canSubmit = admin || context.organizations.some(org => org.id === organizationId && org.role === 'provider_admin');
  return <>
    <Panel title="Provider operational readiness">
      {error ? <ErrorPanel message={error}/> : loading ? <Loading/> : row ? <>
        <dl className="portal-form-grid portal-authority-details">
          <div><dt><T>Organization authority</T></dt><dd><Status value={row.verificationStatus}/></dd></div>
          <div><dt><T>Organization access</T></dt><dd><Status value={row.status}/></dd></div>
          <div><dt><T>Active team members</T></dt><dd>{row.activeMembers}</dd></div>
          <div><dt><T>Owned canonical listings</T></dt><dd>{row.ownedListings}</dd></div>
          <div><dt><T>Published owned listings</T></dt><dd>{row.publishedListings}</dd></div>
          <div><dt><T>Inquiry capability</T></dt><dd><T>{row.canReceiveInquiries ? 'Ready for patient authorization' : 'Support coordination available'}</T></dd></div>
        </dl>
        <p className="portal-review-feedback"><T>{networkNextStep(row)}</T></p>
        <p className="portal-muted"><T>In-app notifications are supported. Email and SMS delivery are not configured for provider coordination.</T></p>
      </> : <p><T>No active organization is selected.</T></p>}
    </Panel>
    {!compact && row && portal !== 'support' && row.origin === 'provider_submitted' && <>
      <ResourceTable resource="organization_verification_requests" title="Private authority review history" params={{ organizationId }} columns={[
        { key: 'legal_name', label: 'Legal name' }, { key: 'status', label: 'Authority review', render: request => <Status value={request.status}/> },
        { key: 'submitted_at', label: 'Submitted', render: request => date(request.submitted_at) },
        { key: 'reviewed_at', label: 'Reviewed', render: request => date(request.reviewed_at) }, { key: 'reason', label: 'Review reason' },
      ]}/>
      {canSubmit && row.verificationStatus !== 'submitted' && !row.ownershipApproved && <Panel title="Submit organization authority evidence">
        <p><T>Upload evidence in Documents first. Admin must review the evidence and confirm your authority through an official contact before granting operational access.</T></p>
        <CommandForm action="submit_organization_verification" input={{ organizationId }} submit="Submit authority review" fields={[
          { key: 'legalName', label: 'Legal name' }, { key: 'contactName', label: 'Contact person' },
          { key: 'contactEmail', label: 'Contact email', type: 'email' }, { key: 'contactPhone', label: 'Contact phone' },
          { key: 'hospitalId', label: 'Existing published hospital (optional)', type: 'select', catalog: 'hospitals', catalogParams: { publicOnly: 'true' } },
          { key: 'documentId', label: 'Private authority document', type: 'select', catalog: 'provider_documents', catalogParams: { organizationId } },
          { key: 'declaration', label: 'Authority declaration', type: 'textarea', help: 'Describe your authority to represent this organization. A declaration alone is not approval.' }, confirmation,
        ]}/>
      </Panel>}
      {admin && row.requestId && <AuthorityReview requestId={row.requestId}/>}
      {admin && <OwnershipControls ready={row}/>}
      <ResourceTable resource="provider_listing_ownership" title="Canonical listing ownership" params={{ organizationId }} columns={[
        { key: 'entity_kind', label: 'Listing type' }, { key: 'entity_id', label: 'Canonical ID' },
        { key: 'assigned_at', label: 'Assigned', render: owner => date(owner.assigned_at) },
        { key: 'revoked_at', label: 'Access', render: owner => <Status value={owner.revoked_at ? 'revoked' : 'active'}/> },
      ]}/>
    </>}
  </>;
}

function AuthorityReview({ requestId }: { requestId: string }) {
  const { organizationId } = usePortal();
  const { data, error, loading } = useResource<{ rows: Row[] }>('organization_verification_requests', { organizationId, id: requestId });
  const request = data?.rows[0];
  return <Panel title="Review organization authority">
    {error ? <ErrorPanel message={error}/> : loading ? <Loading/> : request && <>
      <dl className="portal-form-grid portal-authority-details">
        <div><dt><T>Legal name</T></dt><dd>{String(request.legal_name)}</dd></div>
        <div><dt><T>Contact person</T></dt><dd>{String(request.contact_name)}</dd></div>
        <div><dt><T>Contact email</T></dt><dd>{String(request.contact_email)}</dd></div>
        <div><dt><T>Contact phone</T></dt><dd>{String(request.contact_phone)}</dd></div>
        <div><dt><T>Private authority document</T></dt><dd>{String(request.document_id)}</dd></div>
        <div><dt><T>Requested canonical hospital</T></dt><dd>{String(request.requested_hospital_id ?? 'New listing requested')}</dd></div>
      </dl>
      <p>{String(request.declaration)}</p>
      <p><T>Inspect the private document in Documents and approve it only when valid. Record the actual official-contact confirmation. Do not approve from a matching name or email domain.</T></p>
      {request.status === 'submitted' && <CommandForm action="review_organization_verification" input={{ organizationId, requestId }} submit="Record authority decision" initial={{ status: 'changes_requested' }} fields={[
        { key: 'status', label: 'Authority decision', type: 'select', options: ['changes_requested', 'rejected', 'approved'] }, reason,
        { key: 'contactConfirmation', label: 'Official contact confirmation (required for approval)', type: 'textarea' }, confirmation,
      ]}/>}
    </>}
  </Panel>;
}

function OwnershipControls({ ready }: { ready: NetworkReadiness }) {
  const { organizationId } = usePortal();
  const [kind, setKind] = useState("hospital");
  return <Panel title="Assign or revoke canonical listing ownership">
    <p><T>Use a persisted canonical ID from the published catalog. Hospital assignments must match the reviewed authority request; doctors and packages must belong to an owned hospital. This action does not publish content.</T></p>
    {ready.ownershipApproved && <>
      <label className="portal-field"><span><T>Listing type</T></span><select value={kind} onChange={e=>setKind(e.target.value)}>{["hospital","doctor","package"].map(value=><option key={value} value={value}><T>{value[0].toUpperCase()+value.slice(1)}</T></option>)}</select></label>
      <CommandForm key={kind} action="assign_listing_ownership" input={{ organizationId, entityKind: kind }} submit="Confirm listing ownership" fields={[
      { key: 'entityId', label: 'Published canonical listing', type: 'select', catalog: `${kind}s`, catalogParams: { publicOnly: 'true' } }, { key: 'recordId', label: 'Matching private draft (optional)', type: 'select', catalog: 'provider_records', catalogParams: {organizationId, kind: kind === "hospital" ? "organization" : kind} }, reason, confirmation,
    ]}/></>}
    {ready.ownedListings > 0 && <CommandForm action="revoke_listing_ownership" input={{ organizationId }} submit="Revoke listing ownership" initial={{ entityKind: 'hospital' }} fields={[
      { key: 'entityKind', label: 'Listing type', type: 'select', options: ['hospital', 'doctor', 'package'] },
      { key: 'entityId', label: 'Canonical listing ID' }, reason, confirmation,
    ]}/>}
  </Panel>;
}
