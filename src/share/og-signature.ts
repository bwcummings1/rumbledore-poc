import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PARAM = "s";
const VERSION_KEY_BYTES = 12;

function canonicalOgParams(params: URLSearchParams): string {
  const canonical = new URLSearchParams();
  const entries = [...params.entries()]
    .filter(([key]) => Boolean(key.localeCompare(SIGNATURE_PARAM)))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey),
    );
  for (const [key, value] of entries) {
    canonical.append(key, value);
  }
  return canonical.toString();
}

function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function signaturesMatch(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/iu.test(left) || !/^[0-9a-f]{64}$/iu.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function signOgImageParams(
  params: URLSearchParams,
  secret: string,
): string {
  return hmacHex(secret, canonicalOgParams(params));
}

export function attachOgImageSignature(url: URL, secret: string): URL {
  url.searchParams.delete(SIGNATURE_PARAM);
  url.searchParams.set(
    SIGNATURE_PARAM,
    signOgImageParams(url.searchParams, secret),
  );
  return url;
}

export function verifyOgImageSignature(
  params: URLSearchParams,
  secret: string,
): boolean {
  const signature = params.get(SIGNATURE_PARAM);
  if (!signature) {
    return false;
  }
  return signaturesMatch(signature, signOgImageParams(params, secret));
}

export function ogImageVersionKey(
  contentHash: string | null | undefined,
  secret: string,
): string | null {
  const cleaned = (contentHash ?? "").trim();
  if (!cleaned) {
    return null;
  }
  return hmacHex(secret, `og-image-version:${cleaned}`).slice(
    0,
    VERSION_KEY_BYTES * 2,
  );
}
