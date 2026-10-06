export function validProviderFile(bytes: Uint8Array, mime: string) {
  return mime === "application/pdf"
    ? Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-"
    : mime === "image/png"
      ? Buffer.from(bytes.slice(0, 8)).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        )
      : mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : false;
}
