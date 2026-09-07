/** Build-time public switches. Explicit values override the local-development default. */
export function rolloutEnabled(value: string | undefined, environment: string | undefined): boolean {
  return value === "1" || value === undefined && environment !== "production";
}
// Keep these direct property reads: Next embeds NEXT_PUBLIC values in browser bundles.
export const workshopEnabled = () => rolloutEnabled(process.env.NEXT_PUBLIC_BOTS_WORKSHOP_V1, process.env.NODE_ENV);
export const toyPilotEnabled = () => rolloutEnabled(process.env.NEXT_PUBLIC_BOTS_TOY_PILOT, process.env.NODE_ENV);
