import "server-only";
import { rolloutEnabled } from "@/lib/bots/rollout";

/** Stops only new tutorial enrollment. Existing versioned progress can always resume. */
export const onboardingEnabled = () => rolloutEnabled(process.env.BOTS_ONBOARDING_V1, process.env.NODE_ENV);
/** Explicit preview opt-in; never falls back to an older starter on missing schema. */
export const onboardingV2Enabled = () => process.env.BOTS_ONBOARDING_V2 === "1";
export const missingMigration = (error: { code?: string; message: string }) =>
  ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "") ||
  /could not find (?:the )?(?:table|function).*schema cache|relation .* does not exist|function .* does not exist/i.test(error.message);

/** New styled enrollment and live-house starts require an explicit preview flag. */
export const stylesEnabled = () => process.env.BOTS_STYLES_V1 === "1";
