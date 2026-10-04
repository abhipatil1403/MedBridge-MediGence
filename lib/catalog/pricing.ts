import type { Package } from "@/types/catalog";
export function packagePrice(
  item: Pick<Package, "samplePriceUsd" | "listedPrice" | "currency">,
) {
  return `${item.currency ?? "USD"} ${(item.listedPrice ?? item.samplePriceUsd).toLocaleString("en-US")}`;
}
export function packageDisplayPrice(item: Pick<Package, "samplePriceUsd" | "listedPrice" | "currency">) {
  const currency = item.currency ?? "USD";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency,
    maximumFractionDigits: 2, minimumFractionDigits: 0,
  }).format(item.listedPrice ?? item.samplePriceUsd);
}
