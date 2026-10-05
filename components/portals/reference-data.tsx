"use client";
import { Localized } from '@/components/experience/localized';

import { T } from '@/components/experience/translation';
import { useState } from "react";
import { providerSections, type Row } from "@/lib/portals/config";
import { CommandForm } from "./command-form";
import { ErrorPanel, Loading, Panel, PortalStateContext, ResourceTable, date, usePortal, useResource } from "./core";
import { ProviderContent } from "./provider";
import { ReferenceStarter } from "./reference-starter";
import { PackageStarter } from './package-starter';

export function ReferenceWorkspace() {
  const state = usePortal();
  const [selected, setSelected] = useState("");
  const [section, setSection] = useState("profile");
  const [selectedOrganization, setSelectedOrganization] = useState<Row>();
  const { data, error, loading } = useResource<{rows: Row[]}>("organizations", {origin: "admin_reference", size: "200"});
  const currentOrganization = data?.rows.find(row => row.id === selected);
  // Commands refresh read models. Keep this selected workspace mounted while
  // its organization list reloads so a frozen review dialog keeps its state.
  if (!loading && selectedOrganization !== currentOrganization)
    setSelectedOrganization(currentOrganization);
  const org = currentOrganization ?? (loading && selectedOrganization?.id === selected ? selectedOrganization : undefined);
  return <>
    <PackageStarter onSelect={id=>{setSelected(id);setSection('packages');}}/>
    <ReferenceStarter onSelect={id=>{setSelected(id);setSection("profile");}}/>
    <Panel title="Reference data onboarding">
      <p><T>{"Collect factual information from authoritative public sources. Each populated field needs a source and review before approval and explicit publication. These listings are labelled MedBridge reference information."}</T></p>
      <p className="portal-muted"><T>{"Unlisted prices, services, credentials and consultation modes remain unavailable. A treatment at one branch does not establish availability at another."}</T></p>
      {error ? <ErrorPanel message={error}/> : loading ? <Loading/> : <label className="portal-field"><span><T>{"Reference organization"}</T></span><select value={selected} onChange={event => {setSelected(event.target.value);setSection("profile");}}><option value=""><T>{"Choose an organization"}</T></option>{data?.rows.map(row => <option value={row.id} key={row.id}>{row.name} · {row.status}</option>)}</select></label>}
      <details><summary><T>{"Create a reference organization"}</T></summary><CommandForm action="create_reference_organization" fields={[{key:"name",label:"Official display name"},{key:"providerType",label:"Organization type",type:"select",options:["hospital","clinic","healthcare_organization"]}]} initial={{providerType:"hospital"}} submit="Create private reference workspace" onDone={row => {setSelected(String(row.id));setSection("profile");}}/></details>
    </Panel>
    <PortalStateContext.Provider value={{...state, organizationId: selected, referenceMode:true}}>
      <Localized as="div" className="portal-tabs" role="navigation" aria-label="Reference onboarding steps">
        <button className={`portal-button ${section === "sources" ? "" : "secondary"}`} onClick={()=>setSection("sources")}><T>{"Sources"}</T></button>
        {org && providerSections.filter(([key]) => !["dashboard","onboarding","notifications","settings","team","messages","verification"].includes(key)).map(([key,title]) => <button key={key} className={`portal-button ${section === key ? "" : "secondary"}`} onClick={()=>setSection(key)}>{title}</button>)}
      </Localized>
      {section === "sources" ? <ReferenceSources/> : org ? <><p className="portal-eyebrow">{org.name} <T>{"· ADMIN REFERENCE ·"}</T>{' '}{org.status}</p><ProviderContent section={section}/><details><summary><T>{"Organization availability"}</T></summary><CommandForm action="organization_status" input={{organizationId:org.id}} fields={[{key:"status",label:"Availability",type:"select",options:["active","suspended","archived"]},{key:"message",label:"Reason",type:"textarea"}]} initial={{status:org.status}} submit="Update reference organization availability"/></details></> : <ReferenceSources/>}
    </PortalStateContext.Provider>
  </>;
}
function ReferenceSources() {
  return <>
    <Panel title="Record an authoritative source">
      <p><T>{"Record when the source was actually read. A review due date is an editorial reminder, not a guarantee that the information remains accurate. Add a new source record when checking updated facts."}</T></p>
      <CommandForm action="create_reference_source" fields={[
        {key:"name",label:"Source title"},{key:"url",label:"Public HTTPS URL",type:"url"},
        {key:"sourceType",label:"Source category",type:"select",options:["provider_website","provider_directory","government","regulator","recognized_organization","secondary"]},
        {key:"collectedAt",label:"Collected at (ISO timestamp)",help:"For example 2026-10-04T10:00:00Z. Use the actual collection time."},
        {key:"reviewAfter",label:"Review due",type:"date"},{key:"notes",label:"Private collection notes",type:"textarea"}
      ]} initial={{sourceType:"provider_website",collectedAt:new Date().toISOString()}} submit="Add source"/>
    </Panel>
    <ResourceTable resource="source_records" title="Reference sources" params={{reference:"true"}} columns={[
      {key:"source_name",label:"Source"},{key:"source_type",label:"Category"},
      {key:"source_url",label:"Public URL",render:row=><a href={String(row.source_url)} target="_blank" rel="noreferrer"><T>{"Read source"}</T></a>},
      {key:"retrieved_at",label:"Collected",render:row=>date(row.retrieved_at)},
      {key:"review_after",label:"Review due",render:row=>row.review_after ? date(row.review_after) : "No due date set"},
      {key:"freshness",label:"Refresh",render:row=>{if(!row.review_after)return "No review date set";const days=(Date.parse(`${row.review_after}T23:59:59Z`)-Date.now())/86400000;return days<0?"Stale":days<=14?"Needs review":"Fresh";}}
    ]}/>
  </>;
}
