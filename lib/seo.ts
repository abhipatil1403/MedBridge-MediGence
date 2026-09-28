import type { Metadata } from "next";

export function detailMetadata(title: string, description: string, path: string): Metadata {
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { title: `${title} | MedBridge`, description, url: path, type: "website", siteName: "MedBridge" },
  };
}
