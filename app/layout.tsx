import { T } from '@/components/experience/translation';
import type { Metadata } from "next";
import { PublicChrome } from "@/components/public-chrome";
import "./globals.css";
import "./product.css";
import "./ui-system.css";
import './experience.css';
import { cookies, headers } from 'next/headers';
import { ExperienceProvider } from '@/components/experience/provider';
import { browserLocale, defaultPreferences, preferenceSchema } from '@/lib/experience/preferences';
import { PublicAssistant } from '@/components/experience/public-assistant';
import { NavigationFeedback } from '@/components/navigation-feedback';
import { Suspense } from 'react';
import './production-ux.css';
import './companion.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "MedBridge | A clearer path through care", template: "%s | MedBridge" },
  description: "Ask MedBridge AI to explore sourced healthcare options, compare what is available and organize your next step.",
  icons: {icon: {url:'/brand/medbridge-logo.webp',type:'image/webp'}, shortcut:'/brand/medbridge-logo.webp'},
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let initial={...defaultPreferences,locale:browserLocale((await headers()).get('accept-language')?.split(',')[0]??'en')};
  try {const saved=(await cookies()).get('medbridge_preferences')?.value;if(saved)initial=preferenceSchema.parse(JSON.parse(decodeURIComponent(saved)));}catch{/* Ignore invalid preference cookies. */}
  return (
    <html lang={initial.locale} data-scroll-behavior="smooth">
      <body>
        <ExperienceProvider initial={initial}>
        <a className="skip-link" href="#main-content"><T>{"Skip to content"}</T></a>
        <PublicChrome position="header" />
        <Suspense fallback={null}><NavigationFeedback/></Suspense>
        {children}
        <PublicChrome position="footer" />
        <PublicAssistant/>
        </ExperienceProvider>
      </body>
    </html>
  );
}
