const EMBEDDED_GUID_PATTERN_SOURCE = String.raw`\{?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}?`;
const EMBEDDED_EMAIL_PATTERN_SOURCE = String.raw`[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}`;

export function replaceEmbeddedGuids(
  value: string,
  replacement: (guid: string) => string,
): string {
  return value.replace(
    new RegExp(EMBEDDED_GUID_PATTERN_SOURCE, "gi"),
    replacement,
  );
}

export function replaceEmbeddedEmails(
  value: string,
  replacement = "[redacted-email]",
): string {
  return value.replace(
    new RegExp(EMBEDDED_EMAIL_PATTERN_SOURCE, "gi"),
    replacement,
  );
}

export function containsEmbeddedGuid(value: string): boolean {
  return new RegExp(EMBEDDED_GUID_PATTERN_SOURCE, "i").test(value);
}

export function isGuidValue(value: string): boolean {
  return new RegExp(`^(?:${EMBEDDED_GUID_PATTERN_SOURCE})$`, "i").test(value);
}

export function containsEmbeddedEmail(value: string): boolean {
  return new RegExp(EMBEDDED_EMAIL_PATTERN_SOURCE, "i").test(value);
}
