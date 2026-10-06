// Project only the reviewed Model Kombat iframe exceptions onto the committed
// deployment config. Other working-tree headers, cron and build edits stay out.
const RENDERER_SOURCES = ['/bots-playtest/(.*)', '/bots-display/(.*)'];
function projectRendererHeaders(base, current) {
  const projected = structuredClone(base);
  projected.headers ??= [];
  for (const source of RENDERER_SOURCES) {
    const currentRules = (current.headers ?? []).filter(rule => rule.source === source);
    const currentFrameHeaders = currentRules.flatMap(rule => rule.headers ?? []).filter(header => header.key.toLowerCase() === 'x-frame-options');
    if (currentRules.length !== 1 || currentFrameHeaders.length !== 1 || currentFrameHeaders[0].value !== 'SAMEORIGIN') {
      throw Error(`Missing reviewed SAMEORIGIN override for ${source}`);
    }
    const baseRules = projected.headers.filter(rule => rule.source === source);
    if (baseRules.length > 1) throw Error(`Review duplicate renderer rules for ${source}`);
    const prior = baseRules[0] ?? { source, headers: [] };
    // Retain any committed non-frame headers on these paths and place the
    // narrow exception after the site's broad DENY rule.
    projected.headers = projected.headers.filter(rule => rule.source !== source);
    projected.headers.push({ ...prior, headers: [
      ...(prior.headers ?? []).filter(header => header.key.toLowerCase() !== 'x-frame-options'),
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ] });
  }
  return projected;
}
module.exports = { RENDERER_SOURCES, projectRendererHeaders };
