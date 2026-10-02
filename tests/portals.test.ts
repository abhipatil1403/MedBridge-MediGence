import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { portalAllowed, recordInputSchema, recordKinds, fields, providerSections, sectionKind } from '@/lib/portals/config';
import { portalForHost } from '@/lib/portals/hosts';
import { packagePrice } from '@/lib/catalog/pricing';
import { toFinding } from '@/lib/agents/tools';
import { RequirementEvaluator } from '@/lib/requirements/RequirementEvaluator';
import { extractBudget } from '@/lib/requirements/RequirementNormalizer';
import { pkg, snapshot } from './fixtures/comparison-harness';
import { randomUUID } from 'node:crypto';
import { validProviderFile } from '@/app/api/portals/documents/route';

describe('portal boundaries and provider input',()=>{
  it('never grants a staff portal from provider or patient status',()=>{
    for(const role of [null,'provider_admin','provider_editor','patient']) {
      expect(portalAllowed('admin',role)).toBe(false);expect(portalAllowed('support',role)).toBe(false);
      expect(portalAllowed('provider',role)).toBe(true);
    }
    expect(portalAllowed('support','support_agent')).toBe(true);
    expect(portalAllowed('admin','support_manager')).toBe(false);
    expect(portalAllowed('admin','super_admin')).toBe(true);
  });
  it('maps only explicitly configured exact hosts',()=>{
    const config=JSON.stringify({provider:'provider.medbridge.test',admin:'admin.medbridge.test'});
    expect(portalForHost('provider.medbridge.test:3000',config)).toBe('provider');
    for(const host of ['medbridge-medigence.vercel.app','provider.medbridge.test.attacker.test','attacker.test'])expect(portalForHost(host,config)).toBeUndefined();
    expect(portalForHost('admin.medbridge.test','not JSON')).toBeUndefined();
  });
  it('allows partial drafts but requires revision protection when editing',()=>{
    const base={organizationId:randomUUID(),kind:'organization',name:'QA draft',data:{}};
    expect(recordInputSchema.safeParse(base).success).toBe(true);
    expect(recordInputSchema.safeParse({...base,recordId:randomUUID()}).success).toBe(false);
    expect(recordInputSchema.safeParse({...base,recordId:randomUUID(),expectedRevision:2}).success).toBe(true);
  });
  it('rejects negative facts, invalid currencies, mismatched arrays and unsafe websites',()=>{
    const base={organizationId:randomUUID(),kind:'package',name:'QA package'};
    for(const data of [{price:-3},{durationDays:0},{currency:'invalid'},{inclusions:'not an array'}])expect(recordInputSchema.safeParse({...base,data}).success).toBe(false);
    expect(recordInputSchema.safeParse({...base,kind:'organization',data:{website:'javascript:alert(1)'}}).success).toBe(false);
    expect(recordInputSchema.safeParse({...base,kind:'doctor',data:{experienceYears:-2}}).success).toBe(false);
  });
  it('provides a structured editor for every provider entity and advertised section',()=>{
    for(const kind of recordKinds)expect(fields[kind].length).toBeGreaterThan(0);
    for(const section of Object.keys(sectionKind))expect(providerSections.some(([key])=>key===section)).toBe(true);
  });
  it('checks uploaded bytes rather than trusting the declared MIME type',()=>{
    expect(validProviderFile(Buffer.from('%PDF-1.4\nQA'),'application/pdf')).toBe(true);
    expect(validProviderFile(Buffer.from('<script>QA</script>'),'application/pdf')).toBe(false);
    expect(validProviderFile(Buffer.from([137,80,78,71,13,10,26,10]),'image/png')).toBe(true);
    expect(validProviderFile(Buffer.from([255,216,255]),'image/jpeg')).toBe(true);
  });
});
describe('published provider currency',()=>{
  const indianPackage={...pkg,sourceKind:'first_party' as const,demo:false,currency:'INR',listedPrice:25000,samplePriceUsd:0};
  it('keeps INR in display and tool facts without publishing a fake USD amount',()=>{
    expect(packagePrice(indianPackage)).toBe('INR 25,000');
    const result=toFinding('packages',indianPackage);
    expect(result.facts).toMatchObject({currency:'INR',listedPrice:25000});expect(result.facts.samplePriceUsd).toBeUndefined();
  });
  it('checks matching currency budgets and leaves cross-currency budgets unknown',()=>{
    const finding=toFinding('packages',indianPackage);const data={...snapshot,packages:[indianPackage]};
    expect(RequirementEvaluator.evaluate(finding,[extractBudget('under INR 30000')!],data).evaluations[0].status).toBe('exact');
    const result=RequirementEvaluator.evaluate(finding,[extractBudget('under $30000')!],data).evaluations[0];
    expect(result.status).toBe('unknown');expect(result.explanation).toContain('No currency conversion');
  });
});
