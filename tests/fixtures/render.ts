import {createElement,type ReactNode} from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {ExperienceProvider} from '@/components/experience/provider';
import type {Preferences} from '@/lib/experience/preferences';
export function renderToStaticMarkup(children:ReactNode,initial:Preferences={locale:'en',currency:'USD'}){
 return render(createElement(ExperienceProvider,{initial},children));
}
