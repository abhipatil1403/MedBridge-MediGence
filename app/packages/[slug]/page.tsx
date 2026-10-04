import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import {
  DetailHero,
  DetailNavigation,
  DetailSection,
  FaqList,
} from "@/components/detail-parts";
import { getPackageDetail } from "@/lib/catalog/detail-service";
import { detailMetadata } from "@/lib/seo";
import { packageDisplayPrice } from "@/lib/catalog/pricing";
import { CatalogProvenance } from "@/components/catalog-provenance";
import { publishedRecordProfile } from "@/lib/catalog/provider-profile";
import { packageServiceNames } from "@/lib/catalog/package-services";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPackageDetail(slug);
  return data
    ? detailMetadata(
        data.carePackage.name,
        data.carePackage.description,
        `/packages/${slug}`,
      )
    : {};
}

export default async function PackageDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPackageDetail(slug);
  if (!data) notFound();
  const { carePackage, hospital, treatment, country } = data;
  const profile = await publishedRecordProfile("package", carePackage.recordId);
  if (!carePackage.demo || profile?.serviceDetails) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="container detail-page detail-page--package"
      >
        <Breadcrumbs
          currentPath={`/packages/${slug}`}
          items={[
            { label: "Home", href: "/" },
            { label: "Packages", href: "/packages" },
            { label: carePackage.name },
          ]}
        />
        {carePackage.demo && <DemoNotice />}
        <DetailHero
          type="PUBLISHED CARE PACKAGE"
          title={carePackage.name}
          intro={carePackage.description}
          facts={[
            [carePackage.city ?? hospital?.city, country?.name ?? carePackage.country].filter(Boolean).join(", "),
          ]}
          actions={[
            {
              label: "Prepare planning brief",
              href: `/treatment-plan?package=${slug}`,
              primary: true,
            },
            { label: "Get coordination support", href: "/help" },
          ]}
        />
        <div className="detail-layout">
          <div>
            <DetailSection title="Treatment and provider">
              <p>
                {treatment && (
                  <Link href={`/treatments/${treatment.slug}`}>
                    {treatment.name}
                  </Link>
                )}{" "}
                ·{" "}
                {hospital && (
                  <Link href={`/hospitals/${hospital.slug}`}>
                    {hospital.name}
                  </Link>
                )}
              </p>
            </DetailSection>
            <DetailSection title="Listed price">
              <div className="package-price-block">
                <p className="package-price-block__amount">{packageDisplayPrice(carePackage)}</p>
                <p className="package-price-block__source">{carePackage.priceType === "package_price" ? "Package price" : carePackage.priceType === "starting_price" ? "Starting price" : carePackage.priceType === "published_price" ? "Published price" : "Provider-listed estimate"} · {carePackage.currency ?? "USD"}{carePackage.provenance?.origin === "admin_reference" ? " · collected by MedBridge" : ""}</p>
                <p className="package-price-block__duration">{carePackage.durationDays} listed days</p>
                <p className="package-price-block__confirmation">Confirm the current quote, dates and eligibility with the provider.</p>
              </div>
            </DetailSection>
            <DetailSection title="What's included">
              {!carePackage.inclusions.length && <p>Not provided in published package information.</p>}
              <ul>
                {carePackage.inclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
            <DetailSection title="What's excluded">
              {!carePackage.exclusions.length && <p>Not provided in published package information.</p>}
              <ul>
                {carePackage.exclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
            {(profile?.validFrom || profile?.validUntil || profile?.terms || profile?.notes) && <DetailSection title="Validity and terms">
              <p>
                {profile?.validFrom ?? "Start date not provided"} →{" "}
                {profile?.validUntil ?? "End date not provided"}
              </p>
              <p>{profile?.terms ?? "Confirm terms with the provider."}</p>
              {profile?.notes && <p>{profile.notes}</p>}
            </DetailSection>}
            <DetailSection title="Package services">
              <dl className="fact-list">
                {Object.entries(packageServiceNames).map(([key, name]) => {
                  const service =
                    carePackage.serviceDetails?.[
                      key as keyof typeof packageServiceNames
                    ];
                  return (
                    <div key={key}>
                      <dt>{name}</dt>
                      <dd>
                        {!service || service.status === "not_confirmed"
                          ? "Not confirmed in published package information."
                          : service.status === "included"
                            ? "Included in the published package."
                            : service.status === "excluded"
                              ? "Excluded from the published package."
                              : "Conditional; confirm the published limits with the provider."}
                        {service?.information && <p>{service.information}</p>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="muted">Accommodation and transport are not inferred from hospital stay or other services. Confirm any limits with the provider.</p>
            </DetailSection>
          </div>
          <aside className="detail-aside">
            <h2>Review the full cost</h2>
            <p>
              This listing is not a current quote, reservation or clinical
              recommendation. Additional costs may apply.
            </p>
            <CatalogProvenance item={carePackage} kind="package" />
            <Link className="button button--primary" href="/help">
              Get support
            </Link>
          </aside>
        </div>
      </main>
    );
  }
  const faq = [
    {
      question: "Is this an available offer?",
      answer:
        "No. This package is a synthetic example. A provider must confirm real prices, services, dates, and eligibility.",
    },
    {
      question: "What happens when I prepare a planning brief?",
      answer:
        "The planning brief preserves the sample selection. It does not contact a hospital or process a payment.",
    },
  ];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="container detail-page detail-page--package"
    >
      <Breadcrumbs
        currentPath={`/packages/${slug}`}
        items={[
          { label: "Home", href: "/" },
          { label: "Packages", href: "/packages" },
          { label: carePackage.name },
        ]}
      />
      <DemoNotice compact />
      <DetailHero
        type="DEMO CARE PACKAGE"
        title={carePackage.name}
        intro={carePackage.description}
        facts={[
          country?.name ?? carePackage.country,
          `${carePackage.durationDays} sample days`,
          `USD ${carePackage.samplePriceUsd.toLocaleString()} · demo estimate`,
        ]}
        actions={[
          {
            label: "Prepare planning brief",
            href: `/treatment-plan?package=${slug}`,
            primary: true,
          },
          {
            label: "View hospital",
            href: `/hospitals/${carePackage.hospitalSlug}`,
          },
        ]}
      />
      <DetailNavigation
        items={[
          { label: "Provider", href: "#treatment-and-provider" },
          { label: "Estimate", href: "#estimated-price-and-duration" },
          { label: "Included", href: "#inclusions" },
          { label: "Excluded", href: "#exclusions" },
        ]}
      />
      <div className="detail-layout">
        <div>
          <DetailSection title="Treatment and provider">
            <p>
              Treatment:{" "}
              {treatment ? (
                <Link href={`/treatments/${treatment.slug}`}>
                  {treatment.name}
                </Link>
              ) : (
                carePackage.treatmentSlug
              )}
              . Provider:{" "}
              {hospital ? (
                <Link href={`/hospitals/${hospital.slug}`}>
                  {hospital.name}
                </Link>
              ) : (
                carePackage.hospitalName
              )}
              .
            </p>
          </DetailSection>
          <DetailSection title="Estimated price and duration">
            <p className="sample-price">
              USD {carePackage.samplePriceUsd.toLocaleString()}{" "}
              <small>synthetic estimate</small>
            </p>
            <p>
              Illustrative duration: {carePackage.durationDays} days. This is
              not a quote or a reservation.
            </p>
          </DetailSection>
          <DetailSection title="Inclusions">
            <ul className="plain-list">
              {carePackage.inclusions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </DetailSection>
          <DetailSection title="Exclusions">
            <ul className="plain-list">
              {carePackage.exclusions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </DetailSection>
          <DetailSection title="What this example helps compare">
            <ul className="plain-list">
              {carePackage.benefits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </DetailSection>
          <DetailSection title="Frequently asked questions">
            <FaqList items={faq} />
          </DetailSection>
        </div>
        <aside className="detail-aside">
          <p className="eyebrow">PACKAGE PATHWAY</p>
          <h2>Prepare the next question</h2>
          <p>
            Build a planning brief around this sample package. No payment or
            provider request is made.
          </p>
          <Link
            className="button button--primary button--default"
            href={`/treatment-plan?package=${slug}`}
          >
            Prepare planning brief
          </Link>
          <Link
            className="button button--outline button--default"
            href="/packages"
          >
            Browse packages
          </Link>
        </aside>
      </div>
    </main>
  );
}
