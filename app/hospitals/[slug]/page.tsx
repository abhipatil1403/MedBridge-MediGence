import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import {
  DetailHero,
  DetailNavigation,
  DetailLinks,
  DetailSection,
  FaqList,
} from "@/components/detail-parts";
import { getHospitalDetail } from "@/lib/catalog/detail-service";
import { detailMetadata } from "@/lib/seo";
import { StatusBadge } from "@/components/ui/status-badge";
import { publishedProviderProfile } from "@/lib/catalog/provider-profile";
import { packagePrice } from "@/lib/catalog/pricing";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHospitalDetail(slug);
  return data
    ? detailMetadata(
        data.hospital.name,
        data.hospital.description,
        `/hospitals/${slug}`,
      )
    : {};
}

export default async function HospitalDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getHospitalDetail(slug);
  if (!data) notFound();
  const { hospital, country, treatments, doctors, packages } = data;
  if (!hospital.demo) {
    const profile = await publishedProviderProfile(hospital.recordId);
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="container detail-page detail-page--hospital"
      >
        <Breadcrumbs
          currentPath={`/hospitals/${slug}`}
          items={[
            { label: "Home", href: "/" },
            { label: "Hospitals", href: "/hospitals" },
            { label: hospital.name },
          ]}
        />
        <DetailHero
          type="PUBLISHED PROVIDER"
          title={hospital.name}
          intro={hospital.description}
          facts={[
            `${hospital.city}, ${country?.name ?? hospital.country}`,
            "Provider-submitted information · reviewed for publication",
          ]}
          actions={[
            {
              label: "Open care workspace",
              href: `/assistant?q=${encodeURIComponent(`Show ${hospital.name}`)}`,
              primary: true,
            },
            { label: "Request coordination support", href: "/help" },
          ]}
        />
        <DetailNavigation
          items={[
            { label: "Overview", href: "#overview" },
            { label: "Evidence", href: "#evidence" },
            { label: "Doctors", href: "#doctors" },
            { label: "Packages", href: "#packages" },
            { label: "Contact", href: "#contact" },
          ]}
        />
        <div className="detail-layout">
          <div>
            <DetailSection title="Overview">
              <p>{hospital.description}</p>
            </DetailSection>
            <DetailSection id="evidence" title="Information and evidence">
              <p>
                Publication approval does not establish clinical quality or
                medical suitability. Verification below applies to individual
                fields.
              </p>
              {profile?.fieldReviews?.length ? (
                <dl className="fact-list">
                  {profile.fieldReviews.map((field) => (
                    <div key={field.field}>
                      <dt>{field.field}</dt>
                      <dd>
                        <StatusBadge status={field.status} />
                        <p>{field.evidence}</p>
                        {field.sourceUrl && (
                          <a
                            href={field.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Checked source
                          </a>
                        )}
                        <small>
                          Checked{" "}
                          {new Date(field.checkedAt).toLocaleDateString()}
                        </small>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>
                  No public field evidence is available. Confirm details with
                  the provider.
                </p>
              )}
            </DetailSection>
            <DetailSection title="Specialties">
              <ul className="tag-list">
                {hospital.specialties.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
            <DetailSection title="Treatments">
              <DetailLinks
                items={treatments.map((item) => ({
                  label: item.name,
                  href: `/treatments/${item.slug}`,
                }))}
              />
            </DetailSection>
            <DetailSection title="Facilities">
              <ul className="plain-list">
                {hospital.infrastructure.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
            <DetailSection title="Accreditations">
              {profile?.accreditations?.length ? (
                <ul>
                  {profile.accreditations.map((item) => (
                    <li key={item.name}>
                      {item.name} · {item.body}
                      {item.expiresOn ? ` · expires ${item.expiresOn}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No current accreditation evidence is published.</p>
              )}
            </DetailSection>
            <DetailSection title="International patient services">
              {profile?.internationalServices?.map((item) => (
                <article key={item.name}>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <p>{item.languages?.join(", ")}</p>
                </article>
              ))}
            </DetailSection>
            <DetailSection id="doctors" title="Doctors">
              <DetailLinks
                items={doctors.map((item) => ({
                  label: item.name,
                  href: `/doctors/${item.slug}`,
                  meta: item.specialty,
                }))}
              />
            </DetailSection>
            <DetailSection title="Packages">
              <DetailLinks
                items={packages.map((item) => ({
                  label: item.name,
                  href: `/packages/${item.slug}`,
                  meta: `${packagePrice(item)} · listed estimate`,
                }))}
              />
            </DetailSection>
            <DetailSection id="contact" title="Contact and locations">
              <p>
                {profile?.address ??
                  `${hospital.city}, ${country?.name ?? hospital.country}`}
              </p>
              {profile?.phone && <p>Phone: {profile.phone}</p>}
              {profile?.email && (
                <p>
                  Email: <a href={`mailto:${profile.email}`}>{profile.email}</a>
                </p>
              )}
              {profile?.website && (
                <a href={profile.website} target="_blank" rel="noreferrer">
                  Official provider website
                </a>
              )}
              {profile?.locations?.map((item) => (
                <article key={item.name}>
                  <h3>{item.name}</h3>
                  <p>
                    {item.address} · {item.city}
                  </p>
                  <p>{item.phone}</p>
                </article>
              ))}
            </DetailSection>
          </div>
          <aside className="detail-aside profile-evidence">
            <p className="eyebrow">PUBLISHED SNAPSHOT</p>
            <h2>Confirm your next step</h2>
            <p>
              Prices and provider-submitted services require current
              confirmation. No booking or payment is processed here.
            </p>
            <Link
              className="text-link"
              href={`/assistant?q=${encodeURIComponent(`Verify ${hospital.name}`)}`}
            >
              Check factual information →
            </Link>
            <Link className="text-link" href="/help">
              Get coordination support →
            </Link>
          </aside>
        </div>
      </main>
    );
  }
  const faq = [
    {
      question: "Is this hospital profile verified?",
      answer:
        "No. This is a synthetic MedBridge demonstration record. It does not represent a real hospital.",
    },
    {
      question: "Can I request a current treatment quote?",
      answer:
        "The planning brief is a demo workflow. No provider will be contacted from this preview.",
    },
  ];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="container detail-page detail-page--hospital"
    >
      <Breadcrumbs
        currentPath={`/hospitals/${slug}`}
        items={[
          { label: "Home", href: "/" },
          { label: "Hospitals", href: "/hospitals" },
          { label: hospital.name },
        ]}
      />
      <DemoNotice compact />
      <DetailHero
        type="DEMO HOSPITAL"
        title={hospital.name}
        intro={hospital.description}
        facts={[
          `${hospital.city}, ${country?.name ?? hospital.country}`,
          hospital.specialties.slice(0, 3).join(" · "),
          "Synthetic provider",
        ]}
        actions={[
          {
            label: "Prepare planning brief",
            href: `/treatment-plan?hospital=${slug}`,
            primary: true,
          },
          { label: "View doctors", href: "#doctors" },
        ]}
      />
      <DetailNavigation
        items={[
          { label: "Overview", href: "#overview" },
          {
            label: "Treatments",
            href: "#procedures-and-sample-treatment-costs",
          },
          { label: "Doctors", href: "#doctors" },
          { label: "Packages", href: "#packages" },
          { label: "Location", href: "#location" },
        ]}
      />
      <div className="detail-layout">
        <div>
          <DetailSection title="Overview">
            <p>
              This synthetic profile demonstrates how a hospital page connects
              clinical services, clinicians, package terms, and a quote request.
              No facility claim has been verified.
            </p>
          </DetailSection>
          <DetailSection title="Verification and accreditation">
            <StatusBadge status="unverified" />
            <p>
              This profile is synthetic. Its catalog fields do not establish
              factual verification or clinical suitability.
            </p>
            <details>
              <summary>Illustrative accreditation and catalog status</summary>
              <dl className="fact-list">
                <div>
                  <dt>Catalog status</dt>
                  <dd>{hospital.verification}</dd>
                </div>
                <div>
                  <dt>Accreditation field</dt>
                  <dd>
                    {hospital.sampleAccreditation} — not a real credential
                  </dd>
                </div>
              </dl>
            </details>
          </DetailSection>
          <DetailSection title="Infrastructure">
            <ul className="plain-list">
              {hospital.infrastructure.map((item) => (
                <li key={item}>{item} (illustrative)</li>
              ))}
            </ul>
          </DetailSection>
          <DetailSection title="Specialties">
            <ul className="tag-list">
              {hospital.specialties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </DetailSection>
          <DetailSection title="Procedures and sample treatment costs">
            <div className="data-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Treatment</th>
                    <th scope="col">Sample estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((item) => (
                    <tr key={item.slug}>
                      <td>
                        <Link href={`/treatments/${item.slug}`}>
                          {item.name}
                        </Link>
                      </td>
                      <td>
                        USD {item.sampleBaseCostUsd.toLocaleString()} · demo
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailSection>
          <DetailSection id="doctors" title="Doctors">
            <DetailLinks
              items={doctors.map((item) => ({
                label: item.name,
                href: `/doctors/${item.slug}`,
                meta: `${item.specialty} · demo profile`,
              }))}
            />
          </DetailSection>
          <DetailSection title="Packages">
            <DetailLinks
              items={packages.map((item) => ({
                label: item.name,
                href: `/packages/${item.slug}`,
                meta: `USD ${item.samplePriceUsd.toLocaleString()} · sample`,
              }))}
            />
          </DetailSection>
          <DetailSection title="Location">
            <p>
              {hospital.city}, {country?.name ?? hospital.country}. This
              location is illustrative and is not a real facility address.
            </p>
          </DetailSection>
          <DetailSection title="Frequently asked questions">
            <FaqList items={faq} />
          </DetailSection>
        </div>
        <aside className="detail-aside profile-evidence">
          <p className="eyebrow">INFORMATION & EVIDENCE</p>
          <h2>What is known?</h2>
          <StatusBadge status="demo" />
          <dl>
            <div>
              <dt>Source</dt>
              <dd>Synthetic MedBridge catalog</dd>
            </div>
            <div>
              <dt>Authoritative evidence</dt>
              <dd>Not available for this demo provider</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>No public verification date</dd>
            </div>
          </dl>
          <p>Saved checks are private to your Care Workspace.</p>
          <Link
            className="text-link"
            href={`/assistant?q=${encodeURIComponent(`Verify ${hospital.name}`)}`}
          >
            Open a verification request →
          </Link>
          <Link
            className="text-link"
            href={`/assistant?q=${encodeURIComponent(`Organize documents for ${hospital.name}`)}`}
          >
            Organize requested documents →
          </Link>
        </aside>
      </div>
    </main>
  );
}
