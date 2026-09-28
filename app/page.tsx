import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CompareForm } from "@/components/compare-form";
import { DemoNotice } from "@/components/demo-notice";
import { ReportPicker } from "@/components/discovery/report-picker";
import { SearchBox } from "@/components/discovery/search-box";
import { getHomepageCatalog } from "@/lib/catalog/homepage-service";

export const dynamic = "force-dynamic";

const examples = [
  "I need a second opinion for spine surgery",
  "Find hospitals for knee replacement in India",
  "Compare cancer treatment in India and Turkey",
  "Find a cardiologist for my father",
  "How much does kidney transplant treatment cost?",
];

const quickServices = [
  ["Treatments", "/treatments", "Explore care categories"],
  ["Hospitals", "/hospitals", "Compare sample providers"],
  ["Doctors", "/doctors", "Find specialist profiles"],
  ["Compare", "/compare", "Review destinations"],
  ["Second Opinion", "/second-opinion", "Prepare for review"],
  ["Video Consultation", "/consultation", "Explore appointments"],
  ["Packages", "/packages", "See itemized examples"],
  ["Medical Travel", "/medical-travel", "Plan the journey"],
  ["Recovery", "/recovery", "Continue care"],
] as const;

const journey = [
  { step: "01", name: "Plan", description: "Find the care question, review options, and prepare a decision with a professional.", links: [["Discover treatment", "/treatments"], ["Compare destinations", "/compare"], ["Find hospitals", "/hospitals"], ["Find doctors", "/doctors"], ["Get second opinion", "/second-opinion"]] },
  { step: "02", name: "Treat", description: "Connect provider choice, consultation, package terms, and travel logistics.", links: [["Select provider", "/hospitals"], ["Consultation", "/consultation"], ["Treatment package", "/packages"], ["Medical travel", "/medical-travel"], ["Hospital coordination", "/treatment-plan"]] },
  { step: "03", name: "Recover", description: "Keep rehabilitation, follow-up, and handover visible after treatment.", links: [["Recovery plan", "/recovery"], ["Rehabilitation", "/discover?q=rehabilitation"], ["Follow-up", "/consultation"], ["Local doctor handover", "/recovery"], ["Ongoing support", "/recovery"]] },
] as const;

export default async function Home() {
  const { treatments, hospitals, doctors, countries } = await getHomepageCatalog();
  return <main id="main-content" className="home-page">
    <section className="home-hero" aria-labelledby="home-title"><div className="container home-hero__grid">
      <div><p className="eyebrow">YOUR CARE, MORE CLEARLY CONNECTED</p><h1 id="home-title">Tell us what you need. We&apos;ll help plan the care.</h1><p className="home-hero__lead">Explore treatments, doctors, hospitals, costs and care options in one place.</p></div>
      <div className="home-hero__visual" aria-hidden="true"><span>01 / DISCOVER</span><div className="home-hero__line"><i /><i /><i /></div><p>A question becomes a clearer next step.</p></div>
      <div className="home-hero__search"><SearchBox label="What care are you looking for?" prominent /><div className="home-hero__tools"><ReportPicker /><span>Voice search is not available yet.</span></div>
        <div className="home-examples"><strong>Try a search</strong><div>{examples.map((example) => <Link key={example} href={`/discover?q=${encodeURIComponent(example)}`}>{example} <ArrowUpRight size={14} aria-hidden="true" /></Link>)}</div></div>
      </div>
    </div></section>

    <section className="home-services section-block" aria-labelledby="services-title"><div className="container"><div className="home-section-heading"><div><p className="eyebrow">FIND YOUR STARTING POINT</p><h2 id="services-title">Explore care services</h2></div><p>Move from a question to the next relevant part of your care journey.</p></div><div className="service-grid">{quickServices.map(([name, href, description], index) => <Link href={href} className="service-grid__item" key={href}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><small>{description}</small><ArrowUpRight size={19} aria-hidden="true" /></Link>)}</div></div></section>

    <section className="home-journey section-block" aria-labelledby="journey-title"><div className="container"><div className="home-section-heading"><div><p className="eyebrow">ONE CONNECTED PATH</p><h2 id="journey-title">Plan → Treat → Recover</h2></div><p>Explore each stage without losing sight of what comes after it.</p></div><div className="journey-track">{journey.map((stage) => <article key={stage.step} className="journey-stage"><div className="journey-stage__head"><span>{stage.step}</span><h3>{stage.name}</h3></div><p>{stage.description}</p><ul>{stage.links.map(([label, href]) => <li key={label}><Link href={href}>{label}<ArrowRight size={15} aria-hidden="true" /></Link></li>)}</ul></article>)}</div></div></section>

    <section className="home-treatments section-block" aria-labelledby="popular-title"><div className="container"><div className="home-section-heading"><div><p className="eyebrow">TREATMENT DISCOVERY</p><h2 id="popular-title">Popular treatment topics</h2></div><Link className="text-link" href="/treatments">Browse all treatments <ArrowRight size={16} /></Link></div><DemoNotice compact /><div className="treatment-grid">{treatments.map((item, index) => <Link key={item.slug} href={`/treatments/${item.slug}`}><span>{String(index + 1).padStart(2, "0")} / {item.specialty}</span><strong>{item.name}</strong><ArrowUpRight size={18} aria-hidden="true" /></Link>)}</div></div></section>

    <section className="home-providers section-block" aria-labelledby="hospitals-title"><div className="container"><div className="home-section-heading"><div><p className="eyebrow">PROVIDER DISCOVERY</p><h2 id="hospitals-title">Explore sample hospitals</h2></div><Link className="text-link" href="/hospitals">Browse hospitals <ArrowRight size={16} /></Link></div><div className="provider-list">{hospitals.map((item) => <article className="provider-row" key={item.slug}><div><span className="result-kicker">DEMO HOSPITAL · {item.city}, {item.country}</span><h3><Link href={`/hospitals/${item.slug}`}>{item.name}</Link></h3><p>{item.specialties.slice(0, 4).join(" · ")}</p><small>{item.treatmentSlugs.length} sample procedures · {item.sampleBedCount} sample beds · {item.sampleAccreditation} · {item.verification}</small></div><div><Link className="result-action" href={`/hospitals/${item.slug}`}>View hospital <ArrowRight size={16} /></Link><Link href={`/treatment-plan?hospital=${item.slug}`}>Get treatment quote</Link></div></article>)}</div></div></section>

    <section className="home-doctors section-block" aria-labelledby="doctors-title"><div className="container"><div className="home-section-heading"><div><p className="eyebrow">CLINICIAN DISCOVERY</p><h2 id="doctors-title">Find a sample specialist</h2></div><Link className="text-link" href="/doctors">Browse doctors <ArrowRight size={16} /></Link></div><div className="doctor-grid">{doctors.map((item) => <article key={item.slug}><span className="result-kicker">DEMO CLINICIAN · {item.verification}</span><h3>{item.name}</h3><p>{item.specialty}</p><dl><div><dt>Hospital</dt><dd>{item.hospitalName}</dd></div><div><dt>Location</dt><dd>{item.city}, {item.country}</dd></div><div><dt>Experience</dt><dd>{item.sampleExperienceYears} sample years</dd></div><div><dt>Languages</dt><dd>{item.languages.join(", ")}</dd></div><div><dt>Consultation</dt><dd>{item.consultationMode}</dd></div></dl><Link className="result-action" href={`/doctors/${item.slug}`}>View profile <ArrowRight size={16} /></Link></article>)}</div></div></section>

    <section className="home-compare section-block" aria-labelledby="compare-title"><div className="container home-compare__grid"><div><p className="eyebrow">COUNTRY COMPARISON</p><h2 id="compare-title">Place the options side by side.</h2><p>Choose a treatment and two countries to compare sample costs, provider options, stay and travel considerations.</p><DemoNotice compact /></div><CompareForm treatments={treatments} countries={countries} /></div></section>

    <section className="home-opinion section-block" aria-labelledby="opinion-title"><div className="container home-opinion__grid"><div><p className="eyebrow">INDEPENDENT REVIEW</p><h2 id="opinion-title">A second opinion starts with a complete picture.</h2><p>Share the diagnosis or concern, organize medical records, select a specialty, and request professional review. Any final opinion must come from a qualified clinician.</p><Link className="button button--primary button--default" href="/second-opinion">Get a Second Opinion <ArrowUpRight size={17} /></Link></div><ol><li><span>01</span>Upload medical records</li><li><span>02</span>Share diagnosis or question</li><li><span>03</span>Select specialty</li><li><span>04</span>Request professional review</li><li><span>05</span>Receive a structured opinion</li></ol></div></section>

    <section className="home-final section-block" aria-labelledby="final-title"><div className="container home-final__grid"><div><p className="eyebrow">START WITH YOUR QUESTION</p><h2 id="final-title">Not sure where to start?</h2><p>Describe what you need in your own words. MedBridge will look for matching treatment topics, sample providers, services and destinations.</p></div><SearchBox label="Describe your need" buttonLabel="Find My Options" prominent /></div></section>
  </main>;
}
