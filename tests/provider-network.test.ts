import { describe, expect, it } from 'vitest';
import { networkCommandSchema, networkNextStep, providerConnectivityLabel, type NetworkReadiness } from '@/lib/portals/network';

const organizationId = '10000000-0000-4000-8000-000000000001';
const operationId = '10000000-0000-4000-8000-000000000002';
const ready: NetworkReadiness = {id:organizationId,name:'Local fixture',status:'active',origin:'provider_submitted',verificationStatus:'approved',ownershipApproved:true,activeMembers:1,ownedListings:1,publishedListings:1,canReceiveInquiries:true,inAppNotifications:true,externalDelivery:false,requestId:operationId};
describe('provider authority command validation', () => {
  const command = {action:'submit_organization_verification',input:{organizationId,operationId,confirmed:true,documentId:operationId,hospitalId:'',legalName:'Local authority',contactName:'Representative',contactEmail:'qa@example.org',contactPhone:'00000000',declaration:'I represent this organization for this request.'}};
  it('accepts a new-listing request without fabricating a hospital identity', () => {
    expect(networkCommandSchema.parse(command).input).not.toHaveProperty('hospitalId', '');
  });
  it.each([
    {confirmed:false}, {operationId:''}, {organizationId:'../other'}, {contactEmail:'bad'}, {declaration:'yes'}, {serviceRole:'admin'},
  ])('rejects missing confirmation, malformed identity and extra authority fields %j', patch => {
    expect(networkCommandSchema.safeParse({...command,input:{...command.input,...patch}}).success).toBe(false);
  });
  it('does not accept an automatic publication command in the network workflow', () => {
    expect(networkCommandSchema.safeParse({...command,action:'publish_submission'}).success).toBe(false);
  });
});
describe('factual provider readiness', () => {
  it.each([
    [{origin:'admin_reference'}, 'participating provider'],
    [{status:'suspended'}, 'access is suspended'],
    [{ownershipApproved:false,verificationStatus:'submitted'}, 'wait for Admin review'],
    [{ownershipApproved:false}, 'no longer current'],
    [{activeMembers:0}, 'active team member'],
    [{ownedListings:0}, 'assign the reviewed canonical listing'],
    [{publishedListings:0}, 'explicit publication'],
    [{canReceiveInquiries:false}, 'resolve the listing connection'],
    [{}, 'authorize this organization separately'],
  ])('explains the next unmet requirement %j', (patch, text) => {
    expect(networkNextStep({...ready,...patch})).toContain(text);
  });
  it('never claims confirmed external delivery from connectivity alone', () => {
    for(const state of ['connected','authority_pending','ownership_pending','no_authorized_team','access_suspended','listing_unavailable','no_owner']) {
      expect(providerConnectivityLabel(state)).not.toMatch(/sent to hospital|email delivered|SMS delivered/);
    }
  });
});
