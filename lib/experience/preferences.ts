import { z } from 'zod';

export const currencies = ['USD', 'AED', 'AUD', 'CAD', 'EUR', 'GBP', 'INR', 'MYR'] as const;
export const locales = ['en', 'hi', 'mr'] as const;
export type Currency = typeof currencies[number];
export type Locale = typeof locales[number];
export const localeNames: Record<Locale, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };
export const intlLocales: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };
export const preferenceSchema = z.object({ locale: z.enum(locales), currency: z.enum(currencies) }).strict();
export type Preferences = z.infer<typeof preferenceSchema>;
export const defaultPreferences: Preferences = { locale: 'en', currency: 'USD' };
export function browserLocale(language: string): Locale {
  const base = language.toLowerCase().split('-')[0];
  return locales.includes(base as Locale) ? base as Locale : 'en';
}
export const profileSchema = preferenceSchema.extend({
  display_name: z.string().trim().max(100), phone: z.string().trim().max(30),
  country: z.string().trim().max(80), city: z.string().trim().max(100), inApp: z.boolean(),
}).strict();
export const savedItemSchema = z.object({ kind: z.enum(['hospital', 'doctor', 'package']), recordId: z.uuid(), saved: z.boolean() }).strict();
export const recoveryCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_journey'), title: z.string().trim().min(3).max(120), hospitalId: z.uuid().optional(), caseId: z.uuid().optional() }).strict(),
  z.object({ action: z.literal('update_journey'), journeyId: z.uuid(), stage: z.enum(['preparation', 'after_treatment', 'follow_up', 'rehabilitation_coordination', 'ongoing', 'archived']) }).strict(),
  z.object({ action: z.literal('add_task'), journeyId: z.uuid(), title: z.string().trim().min(3).max(160), dueAt: z.iso.datetime({ offset: true }).optional() }).strict(),
  z.object({ action: z.literal('complete_task'), journeyId: z.uuid(), taskId: z.uuid(), completed: z.boolean() }).strict(),
  z.object({ action: z.literal('add_event'), journeyId: z.uuid(), title: z.string().trim().min(3).max(160), occurredAt: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ action: z.literal('link_document'), journeyId: z.uuid(), documentId: z.uuid() }).strict(),
  z.object({ action: z.literal('create_support'), journeyId: z.uuid(), title: z.string().trim().min(3).max(120), description: z.string().trim().min(5).max(4000), consent: z.literal(true) }).strict(),
]);
