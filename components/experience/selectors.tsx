'use client';
import { currencies, locales, localeNames } from '@/lib/experience/preferences';
import { useExperience } from './provider';
import { useTranslation } from './translation';
export function PreferenceSelectors() {
  const {preferences,setPreferences,notice}=useExperience();const {t}=useTranslation();
  return <div className="preference-selectors">
    <label><span className="sr-only">{t('Currency')}</span><select aria-label={t('Currency')} value={preferences.currency} onChange={e=>void setPreferences({...preferences,currency:e.target.value as typeof preferences.currency})}>{currencies.map(code=><option key={code}>{code}</option>)}</select></label>
    <label><span className="sr-only">{t('Language')}</span><select aria-label={t('Language')} value={preferences.locale} onChange={e=>void setPreferences({...preferences,locale:e.target.value as typeof preferences.locale})}>{locales.map(code=><option value={code} key={code}>{localeNames[code]}</option>)}</select></label>
    {notice&&<span role="status" className="preference-notice">{t(notice)}</span>}
  </div>;
}
