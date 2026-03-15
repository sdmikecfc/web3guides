/**
 * Tiny classNames helper — avoids adding the `clsx` dependency.
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Format an ISO date string into a human-readable short date.
 * e.g. "Mar 15, 2025"
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Truncate text to `maxChars` characters, appending ellipsis if needed.
 */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "…";
}

/**
 * Convert a subdomain key into a pretty title-case label.
 * Fallback only — prefer SUBDOMAINS[key].label.
 */
export function subdomainToLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Build the absolute URL for a guide given the subdomain and slug.
 * Works in both production and local dev.
 */
export function guideUrl(subdomain: string, slug: string): string {
  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "web3guides.com";
  const protocol =
    process.env.NODE_ENV === "development" ? "http" : "https";
  const devRoot =
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? "localhost:3000";
  const host =
    process.env.NODE_ENV === "development"
      ? `${subdomain}.${devRoot}`
      : `${subdomain}.${rootDomain}`;
  return `${protocol}://${host}/guides/${slug}`;
}
