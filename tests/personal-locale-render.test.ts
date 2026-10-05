import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExperienceProvider } from '@/components/experience/provider';
import { LocalDate, LocalDateTime, LocalNumber, T } from '@/components/experience/translation';
import { StatusBadge } from '@/components/ui/status-badge';
import { harness, tools, unavailable } from './fixtures/comparison-harness';
vi.mock('server-only',()=>({}));
function render(locale:'hi'|'mr',child:ReturnType<typeof createElement>){return renderToStaticMarkup(createElement(ExperienceProvider,{initial:{locale,currency:'INR'}},child));}
describe('selected locale in rendered interface',()=>{
  it.each([['hi','अस्पताल'],['mr','रुग्णालये']] as const)('renders hospital navigation in %s',(locale,text)=>expect(render(locale,createElement(T,null,'Hospitals'))).toContain(text));
  it.each(['hi','mr'] as const)('preserves canonical provider names in %s',locale=>expect(render(locale,createElement(T,null,'Deenanath Mangeshkar Hospital'))).toContain('Deenanath Mangeshkar Hospital'));
  it.each(['hi','mr'] as const)('renders localized deterministic UTC dates in %s',locale=>{
    const value='2026-10-04T23:30:00Z',markup=render(locale,createElement(LocalDateTime,{value}));
    expect(markup).toContain('UTC');expect(markup).toContain('dateTime');expect(markup).not.toContain('Oct');
    expect(render(locale,createElement(LocalDate,{value}))).not.toContain('Oct');
    expect(render(locale,createElement(LocalNumber,{value:1234567}))).not.toContain('1,234,567');
  });
  it.each(['hi','mr'] as const)('translates the status explanation in %s',locale=>expect(render(locale,createElement(StatusBadge,{status:'published'}))).not.toContain('Published'));
  it('clinical recovery boundary remains available when the model is unavailable',async()=>{
    const h=harness(unavailable,tools),response=await h.send('Is my recovery medically normal?');
    expect(response.coordination).toBeUndefined();expect(response.summary).toContain('cannot diagnose');expect(h.actions).not.toContain('get_recovery_context');
  });
});
