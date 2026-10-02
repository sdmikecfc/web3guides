/** One credential for the existing collector and its replacement endpoints.
 * An explicitly configured new name takes precedence, including invalid values,
 * so retaining the legacy variable cannot bypass a credential rotation.
 */
export function trackingCredential(env: Record<string, string | undefined>): string | null {
  const token = env.MK_MCP_INGEST_TOKEN !== undefined
    ? env.MK_MCP_INGEST_TOKEN
    : env.MK_WALLET_RESOLVER_TOKEN;
  return token && token.length >= 32 && token.length <= 512 && !/\s/.test(token) ? token : null;
}
