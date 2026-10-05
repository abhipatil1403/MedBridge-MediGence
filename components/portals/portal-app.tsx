"use client";
import { MedBridgeLogo } from '@/components/medbridge-logo';
import { Localized } from '@/components/experience/localized';

import { T } from '@/components/experience/translation';
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  adminSections,
  label,
  portalAllowed,
  providerSections,
  supportSections,
  type Portal,
  type PortalContext,
  type Row,
} from "@/lib/portals/config";
import { PortalStateContext, Panel, type PortalState } from "./core";
import { AdminContent, SupportContent } from "./admin";
import { CreateOrganization, ProviderContent } from "./provider";
import { Cases } from "./cases";
import { CommandForm } from "./command-form";
import "./portal.css";
import { publicUrl } from "@/lib/portals/public-url";
import {RouteSkeleton} from '@/components/route-skeleton';
type PackageInquiry={title:string;description:string;hospitalId?:string};

export function PortalApp({
  portal,
  path = [],
  packageInquiry,
}: {
  portal: Portal;
  path?: string[];
  packageInquiry?: PackageInquiry;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [token, setToken] = useState("");
  const [context, setContext] = useState<PortalContext>();
  const [organizationId, setOrganizationId] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const section = path[0] ?? "dashboard";
  const sections =
    portal === "provider"
      ? providerSections
      : portal === "admin"
        ? adminSections
        : portal === "support"
          ? supportSections
          : ([["cases", "My support requests"]] as const);
  useEffect(() => {
    const client = getBrowserSupabaseClient();
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setToken(data.session?.access_token ?? "");
        setAuthReady(true);
      }
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? "");
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const request = useCallback(
    async <T,>(resource: string, params: Record<string, string> = {}) => {
      const query = new URLSearchParams({ portal, resource, ...params });
      const response = await fetch(`/api/portals?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "This workspace is unavailable.");
      return data as T;
    },
    [portal, token],
  );
  useEffect(() => {
    if (!token) return;
    let active = true;
    request<PortalContext>("context")
      .then((data) => {
        if (active) {
          setError("");
          setContext(data);
          setOrganizationId((current) =>
            data.organizations.some((org) => org.id === current)
              ? current
              : (data.organizations[0]?.id ?? ""),
          );
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Unable to load this portal.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, request]);
  const refresh = useCallback(() => setEpoch((value) => value + 1), []);
  const command = useCallback(
    async (action: string, input: Record<string, unknown>) => {
      const response = await fetch(`/api/portals?portal=${portal}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, input }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to save this change.");
      refresh();
      setNotice("Saved successfully.");
      if (action === "create_organization" || action === "accept_invite") {
        const next = await request<PortalContext>("context");
        setContext(next);
        setOrganizationId(String(data.organizationId ?? data.id));
      }
      return data as Row;
    },
    [portal, token, refresh, request],
  );
  const state = useMemo<PortalState | undefined>(
    () =>
      context
        ? {
            portal,
            context,
            organizationId,
            token,
            epoch,
            refresh,
            request,
            command,
            notice: setNotice,
          }
        : undefined,
    [portal, context, organizationId, token, epoch, refresh, request, command],
  );
  const signOut = async () => {
    await getBrowserSupabaseClient()?.auth.signOut();
    setContext(undefined);
    setError("");
    router.replace(portal === "patient" ? "/help" : `/${portal}/login`);
  };
  if (!getBrowserSupabaseClient())
    return (
      <main id="main-content" className="portal-login">
        <h1><T>{"Sign-in is unavailable"}</T></h1>
        <p><T>{"The site’s authentication configuration is missing."}</T></p>
        <Link href={publicUrl()}><T>{"Back to MedBridge"}</T></Link>
      </main>
    );
  if (!authReady)
    if(portal==='patient')return <RouteSkeleton kind="help"/>;else
    return (
      <main id="main-content" className="portal-login">
        <p role="status"><T>{"Loading sign-in…"}</T></p>
      </main>
    );
  if (!token || section === "login")
    return (
      <PortalLogin
        portal={portal}
        authenticated={Boolean(token)}
        onContinue={() =>
          router.push(portal === "patient" ? "/help" : `/${portal}/dashboard`)
        }
        onSignOut={() => void signOut()}
      />
    );
  if (error)
    return (
      <main id="main-content" className="portal-login">
        <Link className="portal-brand" href={publicUrl()}>
          <MedBridgeLogo/>
        </Link>
        <div className="portal-login-card">
          <ShieldCheck size={32} />
          <h1><T>{"Portal access unavailable"}</T></h1>
          <p role="alert">{error}</p>
          <button className="portal-button" onClick={() => void signOut()}>
            <T>{"Sign in with a different account"}</T></button>
          <Link href={publicUrl()}><T>{"Back to MedBridge"}</T></Link>
        </div>
      </main>
    );
  if (!context || !state)
    if(portal==='patient')return <RouteSkeleton kind="help"/>;else
    return (
      <main id="main-content" className="portal-login">
        <p role="status"><T>{"Verifying portal access…"}</T></p>
      </main>
    );
  if (!portalAllowed(portal, context.role)) return null;
  const title =
    sections.find(([key]) => key === section)?.[1] ??
    (portal === "patient" ? "Support requests" : "Page unavailable");
  return (
    <PortalStateContext.Provider value={state}>
      {portal==='patient'?<main id="main-content" tabIndex={-1} className="container patient-help-page"><header><MedBridgeLogo compact/><p className="eyebrow">MEDBRIDGE SUPPORT</p><h1><T>{'Get help'}</T></h1><p><T>{'Ask for help with your next step and follow the response here.'}</T></p></header>{notice&&<p role="status" className="personal-notice">{notice}</p>}<PatientSupport packageInquiry={packageInquiry}/></main>:
      <div className={`portal-shell portal-${portal}`}>
        <aside className={`portal-sidebar ${menu ? "is-open" : ""}`}>
          <div className="portal-sidebar-brand">
            <Link href={publicUrl()} className="portal-brand">
              <MedBridgeLogo onDark/>
            </Link>
            <Localized as="button"
              className="portal-icon-button portal-mobile-only"
              onClick={() => setMenu(false)}
              aria-label="Close navigation"
            >
              <X size={20} />
            </Localized>
          </div>
          <p className="portal-sidebar-label">
            <T>{`${label(portal)} portal`}</T>
          </p>
          <nav aria-label={`${label(portal)} navigation`}>
            {sections.map(([key, name], index) => (
              <Link
                key={key}
                href={`/${portal}/${key}`}
                className={key === section ? "is-active" : ""}
                aria-current={key === section ? "page" : undefined}
                onClick={() => setMenu(false)}
              >
                {index === 0 ? (
                  <LayoutDashboard size={18} />
                ) : ["verification", "settings", "users"].includes(key) ? (
                  <ShieldCheck size={18} />
                ) : key === "notifications" ? (
                  <Bell size={18} />
                ) : (
                  <Building2 size={18} />
                )}
                <span><T>{name}</T></span>
              </Link>
            ))}
          </nav>
          <div className="portal-sidebar-bottom">
            <Link href={publicUrl()}>
              <T>{"Public MedBridge"}</T><ArrowUpRight size={15} />
            </Link>
            <span>{context.email}</span>
            <button onClick={() => void signOut()}>
              <LogOut size={16} />
              <T>{"Sign out"}</T></button>
          </div>
        </aside>
        {menu && (
          <Localized as="button"
            className="portal-nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <div className="portal-main">
          <header className="portal-topbar">
            <Localized as="button"
              className="portal-icon-button portal-mobile-only"
              onClick={() => setMenu(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </Localized>
            <div>
              <small><T>{"MedBridge /"}</T>{' '}<T>{label(portal)}</T></small>
              <strong><T>{title}</T></strong>
            </div>
            <div className="portal-topbar-right">
              {portal === "provider" && context.organizations.length > 0 && (
                <label>
                  <span className="sr-only"><T>{"Organization"}</T></span>
                  <select
                    value={organizationId}
                    onChange={(event) => setOrganizationId(event.target.value)}
                  >
                    {context.organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="portal-role">
                {label(
                  context.role ??
                    context.organizations.find(
                      (org) => org.id === organizationId,
                    )?.role ??
                    "patient",
                )}
              </span>
              {(
                <Link
                  className="portal-icon-button"
                  href={`/${portal}/notifications`}
                  aria-label="Notifications"
                >
                  <Bell size={20} />
                </Link>
              )}
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="portal-content">
            <div className="portal-page-heading">
              <p className="portal-eyebrow">
                {portal === "provider"
                  ? (context.organizations.find(
                      (org) => org.id === organizationId,
                    )?.name ?? "Your organization")
                  : <><T>{label(portal)}</T>{' '}<T>{'workspace'}</T></>}
              </p>
              <h1><T>{title}</T></h1>
              <p>
                <T>{portal === "provider"
                  ? "Manage your MedBridge presence, evidence and publication."
                  : portal === "admin"
                    ? "Review provider submissions and govern the platform."
                    : portal === "support"
                      ? "Coordinate authorized patient and provider requests."
                      : "Create a support request and choose which context to share."}</T>
              </p>
            </div>
            {notice && (
              <div className="portal-notice" role="status">
                {notice}
                <Localized as="button"
                  onClick={() => setNotice("")}
                  aria-label="Dismiss message"
                >
                  <X size={16} />
                </Localized>
              </div>
            )}
            {search.get("invite") && portal === "provider" && (
              <Panel title="Organization invitation">
                <CommandForm
                  action="accept_invite"
                  input={{ inviteId: search.get("invite") }}
                  fields={[]}
                  submit="Accept invitation"
                />
              </Panel>
            )}
            {!sections.some(([key]) => key === section) ? (
              <Panel title="Page unavailable">
                <p><T>{"This page does not exist in this portal."}</T></p>
                <Link href={`/${portal}/dashboard`}><T>{"Return to dashboard"}</T></Link>
              </Panel>
            ) : portal === "provider" && !organizationId ? (
              <CreateOrganization />
            ) : portal === "provider" ? (
              <ProviderContent section={section} />
            ) : portal === "admin" ? (
              <AdminContent section={section} />
            ) : portal === "support" ? (
              <SupportContent section={section} />
            ) : (
              <PatientSupport packageInquiry={packageInquiry}/>
            )}
          </main>
        </div>
      </div>}
    </PortalStateContext.Provider>
  );
}
function PortalLogin({
  portal,
  authenticated,
  onContinue,
  onSignOut,
}: {
  portal: Portal;
  authenticated: boolean;
  onContinue: () => void;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  return (
    <main id="main-content" className={portal==='patient'?'portal-login patient-help-login':'portal-login'}>
      <Link className="portal-brand" href={publicUrl()}>
        <MedBridgeLogo/>
      </Link>
      <div className="portal-login-card">
        <span className="portal-login-icon">
          <ShieldCheck size={29} />
        </span>
        <p className="portal-eyebrow">{portal==='patient'?'MEDBRIDGE SUPPORT':<>{label(portal)} <T>{"portal"}</T></>}</p>
        <h1>
          <T>{portal==='patient'?(authenticated?'My support requests':'Sign in for support'):authenticated
            ? "Continue to your workspace"
            : "Sign in to your workspace"}</T>
        </h1>
        <p>
          <T>{portal === "provider"
            ? "Manage your organization, documents and published care offerings."
            : portal === "admin"
              ? "Access is limited to assigned platform administrators."
              : portal === "support"
                ? "Access is limited to assigned operations staff."
                : "Get help with your MedBridge care coordination."}</T>
        </p>
        {authenticated ? (
          <div className="portal-actions">
            <button className="portal-button" onClick={onContinue}>
              <T>{"Continue"}</T></button>
            <button className="portal-button secondary" onClick={onSignOut}>
              <T>{"Switch account"}</T></button>
          </div>
        ) : sent ? (
          <div role="status">
            <h2><T>{"Check your email"}</T></h2>
            <p>
              <T>{"Click the sign-in link to confirm your email and return to this portal."}</T></p>
            <button
              className="portal-button secondary"
              onClick={() => setSent(false)}
            >
              <T>{"Use another email"}</T></button>
          </div>
        ) : (
          <form
            className="portal-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const client = getBrowserSupabaseClient();
                if (!client)
                  throw new Error("Sign-in is temporarily unavailable.");
                const next =
                  portal === "patient" ? "/help" : `/${portal}/dashboard`;
                const redirect = new URL(
                  "/auth/callback",
                  window.location.origin,
                );
                redirect.searchParams.set(
                  "next",
                  next + window.location.search,
                );
                const { error } = await client.auth.signInWithOtp({
                  email: email.trim(),
                  options: {
                    shouldCreateUser:
                      portal === "provider" || portal === "patient",
                    emailRedirectTo: redirect.toString(),
                  },
                });
                if (error)
                  throw new Error(
                    "Unable to send a sign-in link. Confirm your email and try again.",
                  );
                setSent(true);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Unable to sign in.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="portal-field">
              <span><T>{"Email address"}</T></span>
              <Localized as="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@organization.com"
              />
            </label>
            {error && (
              <p className="portal-field-error" role="alert">
                {error}
              </p>
            )}
            <button className="portal-button" disabled={busy}>
              <T>{busy ? "Sending link…" : "Send sign-in link"}</T>
            </button>
          </form>
        )}
        <p className="portal-login-footer">
          <T>{portal==='patient'?'Your support requests are private.':'Protected access · Database enforced permissions'}</T></p>
        <Link href={publicUrl()}><T>{"Back to public MedBridge"}</T></Link>
      </div>
    </main>
  );
}
function PatientSupport({packageInquiry}: {packageInquiry?:PackageInquiry}) {
  return (
    <>
      <Panel title="Create a request">
        <details className="privacy-sharing"><summary><T>{'Privacy & sharing'}</T></summary><p><T>{"Support can access only this request and the context you explicitly choose. Internal staff notes are private to staff. You can revoke access from the case workspace."}</T></p></details>
        <CommandForm
          action="create_case"
          advancedKeys={['conversationId','documentWorkspaceId','shareConversation','shareDocuments','shareWithProvider']}
          fields={[
            { key: "title", label: "Request title" },
            { key: "description", label: "How can we help?", type: "textarea" },
            {
              key: "caseType",
              label: "Request type",
              type: "select",
              options: [
                "coordination",
                "provider",
                "documents",
                "account",
                "other",
              ],
            },
            {
              key: "hospitalId",
              label: "Related published provider (optional)",
              type: "select",
              catalog: "hospitals",
            },
            {
              key: "conversationId",
              label: "Related conversation (optional)",
              type: "select",
              catalog: "conversations",
            },
            {
              key: "documentWorkspaceId",
              label: "Document workspace (optional)",
              type: "select",
              catalog: "document_workspaces",
            },
            {
              key: "shareConversation",
              label: "Share the selected conversation and care plan",
              type: "checkbox",
            },
            {
              key: "shareDocuments",
              label: "Share the selected document workspace",
              type: "checkbox",
            },
            {
              key: "shareWithProvider",
              label:
                "Allow the related provider team to access this request and selected shared context",
              type: "checkbox",
            },
            {
              key: "consent",
              label:
                "I authorize MedBridge support to coordinate this request using only the context I selected",
              type: "checkbox",
            },
          ]}
          initial={{ caseType: "coordination", ...(packageInquiry ? {title:`Package inquiry: ${packageInquiry.title}`,description:packageInquiry.description,hospitalId:packageInquiry.hospitalId ?? ''} : {}) }}
          submit="Create support request"
        />
      </Panel>
      <Cases />
    </>
  );
}
