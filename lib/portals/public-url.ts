/** Public links must leave a future dedicated portal host. */
export function publicUrl(path = "/") {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  return origin ? new URL(path, origin).toString() : path;
}
