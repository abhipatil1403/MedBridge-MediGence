import { z } from 'zod';

export const networkActions = ['submit_organization_verification', 'review_organization_verification', 'assign_listing_ownership', 'revoke_listing_ownership'] as const;
const base = { organizationId: z.uuid(), operationId: z.uuid(), confirmed: z.literal(true) };
const text = (max: number, min = 2) => z.string().trim().min(min).max(max);
const optionalId = z.preprocess(value => value === '' ? undefined : value, z.uuid().optional());
export const networkCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal(networkActions[0]), input: z.object({ ...base, documentId: z.uuid(), hospitalId: optionalId, legalName: text(200), contactName: text(200), contactEmail: z.email().max(320), contactPhone: text(80, 5), declaration: text(2000, 10) }).strict() }),
  z.object({ action: z.literal(networkActions[1]), input: z.object({ ...base, requestId: z.uuid(), status: z.enum(['approved', 'rejected', 'changes_requested']), reason: text(2000, 10), contactConfirmation: z.string().trim().max(2000).optional() }).strict() }),
  ...([networkActions[2], networkActions[3]] as const).map(action => z.object({ action: z.literal(action), input: z.object({ ...base, entityKind: z.enum(['hospital', 'doctor', 'package']), entityId: z.uuid(), recordId: optionalId, reason: text(2000, 10) }).strict() })),
]);

export type NetworkReadiness = {
  id: string; name: string; status: string; origin: string; verificationStatus: string;
  ownershipApproved: boolean; activeMembers: number; ownedListings: number;
  publishedListings: number; canReceiveInquiries: boolean; inAppNotifications: boolean;
  externalDelivery: boolean; requestId: string | null;
};
export function networkNextStep(row: NetworkReadiness): string {
  if (row.origin !== 'provider_submitted') return 'Reference information is published independently. A participating provider must complete its own authority review.';
  if (row.status !== 'active') return 'Organization access is suspended or archived. Ask Admin to review the access decision.';
  if (!row.ownershipApproved) return row.verificationStatus === 'approved'
    ? 'Approved evidence is no longer current. Ask Admin to review the evidence before coordination can resume.'
    : 'Submit authority evidence and wait for Admin review. Registration does not authorize patient access.';
  if (!row.activeMembers) return 'Add an authorized active team member before receiving inquiries.';
  if (!row.ownedListings) return 'Ask Admin to assign the reviewed canonical listing, or submit a new listing for review.';
  if (!row.publishedListings) return 'The owned listing must pass the existing review and explicit publication process.';
  if (!row.canReceiveInquiries) return 'Admin must resolve the listing connection before provider coordination can begin.';
  return 'Ready for consent-controlled inquiries. Each patient must authorize this organization separately.';
}

export function providerConnectivityLabel(value: string): string {
  return ({connected:'Provider connected; patient authorization is still required.', authority_pending:'Organization authority review is pending. Continue Support coordination.', ownership_pending:'Organization authority is approved; Admin must assign canonical ownership.', no_authorized_team:'Verified organization has no active authorized team. Ask Admin to review access.', access_suspended:'Provider access is suspended. Continue Support coordination.', listing_unavailable:'The owned listing is unavailable for provider coordination.', no_owner:'No operational owner is connected to this listing. Continue Support coordination.'} as Record<string,string>)[value] ?? 'Review provider connectivity with Admin.';
}
