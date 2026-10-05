import { LocalDate, LocalNumber } from '@/components/experience/translation';
import { T } from '@/components/experience/translation';
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
import { Price } from '@/components/experience/price';
import { SaveButton } from '@/components/experience/saved';
import { CatalogProvenance } from "@/components/catalog-provenance";
import { fieldLabel } from "@/lib/catalog/field-label";

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
  const profile = await publishedProviderProfile(hospital.recordId);
  if (!hospital.demo || profile?.sections) {
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
        {hospital.demo && <DemoNotice />}
        <div className="inline-actions"><SaveButton kind="hospital" recordId={hospital.recordId}/></div>
        <DetailHero
          type={hospital.provenance?.origin === "admin_reference" ? "MEDBRIDGE REFERENCE" : "PUBLISHED PROVIDER"}
          title={hospital.name}
          intro={hospital.description}
          facts={[
            `${hospital.city}, ${country?.name ?? hospital.country}`,
            "Reviewed for publication · confirm current details",
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
                <T>{"Publication approval does not establish clinical quality or medical suitability. Verification below applies to individual fields."}</T></p>
              {profile?.fieldReviews?.length ? (
                <dl className="fact-list">
                  {profile.fieldReviews.map((field) => (
                    <div key={field.field}>
                      <dt>{fieldLabel(field.field)}</dt>
                      <dd>
                        <StatusBadge status={field.status} />
                        {field.sourceUrl && (
                          <a
                            href={field.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <T>{"Checked source"}</T></a>
                        )}
                        <small>
                          <T>{"Checked"}</T>{" "}
                          <LocalDate value={field.checkedAt}/>
                        </small>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>
                  <T>{"No public field evidence is available. Confirm details with the provider."}</T></p>
              )}
            </DetailSection>
            <DetailSection title="Specialties">
              {!hospital.specialties.length && <p><T>{"Not provided in published information."}</T></p>}
              <ul className="tag-list">
                {hospital.specialties.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
            <DetailSection title="Departments and provider information">
              {profile?.sections?.filter(
                (item) =>
                  item.kind === "specialty" || item.kind === "treatment",
              ).length ? (
                profile.sections
                  .filter(
                    (item) =>
                      item.kind === "specialty" || item.kind === "treatment",
                  )
                  .map((item) => (
                    <article key={`${item.kind}:${item.name}`}>
                      <h3>{item.department || item.name}</h3>
                      {item.locationCity && <p><T>{"Documented location:"}</T>{' '}{item.locationCity}</p>}
                      <p>
                        {item.description ||
                          "Provider-specific information not provided."}
                      </p>
                      {item.availability && (
                        <p>
                          <T>{"Availability:"}</T>{' '}{item.availability.replaceAll("_", " ")}
                        </p>
                      )}
                      {item.eligibilityNote && <p>{item.eligibilityNote}</p>}
                    </article>
                  ))
              ) : (
                <p><T>{"No department information has been published."}</T></p>
              )}
            </DetailSection>
            <DetailSection title="Treatments">
              {!treatments.length && <p><T>{"No treatments have been published."}</T></p>}
              <DetailLinks
                items={treatments.map((item) => ({
                  label: item.name,
                  href: `/treatments/${item.slug}`,
                }))}
              />
            </DetailSection>
            <DetailSection title="Facilities">
              {!profile?.sections?.some(item => item.kind === "facility") && !hospital.infrastructure.length && <p><T>{"Not provided in published information."}</T></p>}
              {profile?.sections
                ?.filter((item) => item.kind === "facility")
                .map((item) => (
                  <article key={item.name}>
                    <h3>{item.name}</h3>
                    <p>{item.description || "Description not provided."}</p>
                    {item.locationCity && <p><T>{"Documented location:"}</T>{' '}{item.locationCity}</p>}
                    <p>
                      <T>{"Availability:"}</T>{" "}
                      {item.availability?.replaceAll("_", " ") ||
                        "Not provided"}
                    </p>
                  </article>
                ))}
              {!profile?.sections?.some(item => item.kind === "facility") && <ul className="plain-list">
                {hospital.infrastructure.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>}
            </DetailSection>
            <DetailSection title="Accreditations">
              {profile?.accreditations?.length ? (
                <ul>
                  {profile.accreditations.map((item) => (
                    <li key={item.name}>
                      {item.name} · {item.body}
                      <T>{" · Current evidence reviewed"}</T>
                      {item.expiresOn ? ` · expires ${item.expiresOn}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p><T>{"No current accreditation evidence is published."}</T></p>
              )}
            </DetailSection>
            {!!profile?.internationalServices?.length && <DetailSection title="International patient services">
              {profile?.internationalServices?.map((item) => (
                <article key={item.name}>
                  <h3>{item.name}</h3>
                  {item.description && <p>{item.description}</p>}
                  {!!item.languages?.length && <p>{item.languages.join(", ")}</p>}
                  <p><T>{"Availability:"}</T>{' '}{item.availability?.replaceAll("_", " ") || "Not provided"}</p>
                </article>
              ))}
            </DetailSection>}
            <DetailSection id="doctors" title="Doctors">
              {!doctors.length && <p><T>{"No associated doctors have been published."}</T></p>}
              <DetailLinks
                items={doctors.map((item) => ({
                  label: item.name,
                  href: `/doctors/${item.slug}`,
                  meta: item.specialty,
                }))}
              />
            </DetailSection>
            <DetailSection title="Packages">
              {!packages.length && <p><T>{"No associated packages have been published."}</T></p>}
              <DetailLinks
                items={packages.map((item) => ({
                  label: item.name,
                  href: `/packages/${item.slug}`,
                  meta: <Price amount={item.listedPrice??item.samplePriceUsd} currency={item.currency??'USD'}/>,
                }))}
              />
            </DetailSection>
            <DetailSection id="contact" title="Contact and locations">
              <p>
                {profile?.address ??
                  `${hospital.city}, ${country?.name ?? hospital.country}`}
              </p>
              {profile?.phone && <p><T>{"Phone:"}</T>{' '}{profile.phone}</p>}
              {profile?.email && (
                <p>
                  <T>{"Email:"}</T><a href={`mailto:${profile.email}`}>{profile.email}</a>
                </p>
              )}
              {profile?.website && (
                <a href={profile.website} target="_blank" rel="noreferrer">
                  <T>{"Official provider website"}</T></a>
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
            <p className="eyebrow"><T>{"PUBLISHED SNAPSHOT"}</T></p>
            <h2><T>{"Confirm your next step"}</T></h2>
            <p>
              <T>{"Prices and documented services require current confirmation. No booking or payment is processed here."}</T></p>
            <CatalogProvenance item={hospital} kind="hospital" />
            <Link
              className="text-link"
              href={`/assistant?q=${encodeURIComponent(`Verify ${hospital.name}`)}`}
            >
              <T>{"Check factual information →"}</T></Link>
            <Link className="text-link" href="/help">
              <T>{"Get coordination support →"}</T></Link>
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
              <T>{"This synthetic profile demonstrates how a hospital page connects clinical services, clinicians, package terms, and a quote request. No facility claim has been verified."}</T></p>
          </DetailSection>
          <DetailSection title="Verification and accreditation">
            <StatusBadge status="unverified" />
            <p>
              <T>{"This profile is synthetic. Its catalog fields do not establish factual verification or clinical suitability."}</T></p>
            <details>
              <summary><T>{"Illustrative accreditation and catalog status"}</T></summary>
              <dl className="fact-list">
                <div>
                  <dt><T>{"Catalog status"}</T></dt>
                  <dd>{hospital.verification}</dd>
                </div>
                <div>
                  <dt><T>{"Accreditation field"}</T></dt>
                  <dd>
                    {hospital.sampleAccreditation} <T>{"— not a real credential"}</T></dd>
                </div>
              </dl>
            </details>
          </DetailSection>
          <DetailSection title="Infrastructure">
            <ul className="plain-list">
              {hospital.infrastructure.map((item) => (
                <li key={item}>{item} <T>{"(illustrative)"}</T></li>
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
                    <th scope="col"><T>{"Treatment"}</T></th>
                    <th scope="col"><T>{"Sample estimate"}</T></th>
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
                        USD <LocalNumber value={item.sampleBaseCostUsd}/> <T>{"· demo"}</T></td>
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
              {hospital.city}, {country?.name ?? hospital.country}<T>{". This location is illustrative and is not a real facility address."}</T></p>
          </DetailSection>
          <DetailSection title="Frequently asked questions">
            <FaqList items={faq} />
          </DetailSection>
        </div>
        <aside className="detail-aside profile-evidence">
          <p className="eyebrow"><T>{"INFORMATION & EVIDENCE"}</T></p>
          <h2><T>{"What is known?"}</T></h2>
          <StatusBadge status="demo" />
          <dl>
            <div>
              <dt><T>{"Source"}</T></dt>
              <dd><T>{"Synthetic MedBridge catalog"}</T></dd>
            </div>
            <div>
              <dt><T>{"Authoritative evidence"}</T></dt>
              <dd><T>{"Not available for this demo provider"}</T></dd>
            </div>
            <div>
              <dt><T>{"Last checked"}</T></dt>
              <dd><T>{"No public verification date"}</T></dd>
            </div>
          </dl>
          <p><T>{"Saved checks are private to your Care Workspace."}</T></p>
          <Link
            className="text-link"
            href={`/assistant?q=${encodeURIComponent(`Verify ${hospital.name}`)}`}
          >
            <T>{"Open a verification request →"}</T></Link>
          <Link
            className="text-link"
            href={`/assistant?q=${encodeURIComponent(`Organize documents for ${hospital.name}`)}`}
          >
            <T>{"Organize requested documents →"}</T></Link>
        </aside>
      </div>
    </main>
  );
}
