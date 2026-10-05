import type { NavigationItem } from "@/types/navigation";

export const navigation: NavigationItem[] = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/discover" },
  { label: "MedBridge AI", href: "/assistant" },
  { label: "Treatments", href: "/treatments" },
  { label: "Hospitals", href: "/hospitals" },
  { label: "Doctors", href: "/doctors" },
  { label: "Compare", href: "/compare" },
  { label: "Second opinion", href: "/second-opinion" },
];

export function isActiveNavigation(pathname: string, href: string) {
  return pathname === href || href !== "/" && pathname.startsWith(`${href}/`);
}

export const navigationGroups = [
  { label: 'Explore', items: [navigation[1], navigation[3], navigation[4], navigation[5], navigation[6]] },
  { label: 'Plan', items: [navigation[2], { label: 'My plans', href: '/account?section=plans' }] },
  { label: 'Treat', items: [{ label: 'Packages', href: '/packages' }, navigation[7], { label: 'Consultation pathway', href: '/consultation' }] },
  { label: 'Recover', items: [{ label: 'Lifetime Recover', href: '/recover' }, { label: 'Help / Support', href: '/help' }] },
] as const;
