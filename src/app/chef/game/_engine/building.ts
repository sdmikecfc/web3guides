/** Shared, renderer-free room finishes and recoverable restaurant condition. */
export interface FinishDef { id: string; label: string; color: string; accent: string }
export const FLOOR_FINISHES: FinishDef[] = [
  { id: "cream", label: "Honey cream", color: "#f1dfbb", accent: "#dbc495" },
  { id: "terracotta", label: "Terracotta", color: "#ca8566", accent: "#b56b54" },
  { id: "sage", label: "Garden green", color: "#a6bc9a", accent: "#8ca886" },
  { id: "checker", label: "Café checker", color: "#f2e7d3", accent: "#b6c0ac" },
  { id: "oak", label: "Warm oak", color: "#c69768", accent: "#ad7e53" },
];
export const WALL_FINISHES: FinishDef[] = [
  { id: "plaster", label: "Vanilla plaster", color: "#f4e5c9", accent: "#dcc9a8" },
  { id: "sage", label: "Sage green", color: "#c2d1b6", accent: "#9caf91" },
  { id: "rose", label: "Dusty rose", color: "#e5c0b4", accent: "#c89788" },
  { id: "sky", label: "Morning blue", color: "#bed5d8", accent: "#90b6bc" },
];
export const AWNINGS: FinishDef[] = [
  { id: "terracotta", label: "Tomato & cream", color: "#bd644c", accent: "#fff0d5" },
  { id: "sage", label: "Garden café", color: "#688b69", accent: "#fff0d5" },
  { id: "blue", label: "Seaside blue", color: "#608fa1", accent: "#fff0d5" },
  { id: "stripe", label: "Sunny stripe", color: "#d5a04d", accent: "#fff0d5" },
];
export interface RestaurantDesign {
  floor: string;
  wall: string;
  /** Sparse overrides; keys are integer grid coordinates, e.g. "2,3". */
  tiles: Record<string, string>;
  /** Sparse wall overrides; keys are "left,2" or "right,3". */
  wallTiles: Record<string, string>;
  storefront: { awning: string; sign: string };
}
export interface MaintenanceState { cleanliness: number; equipment: number; lastSettledAt: number }
export function defaultDesign(): RestaurantDesign {
  return { floor: "cream", wall: "plaster", tiles: {}, wallTiles: {}, storefront: { awning: "terracotta", sign: "" } };
}
export function defaultMaintenance(): MaintenanceState { return { cleanliness: 100, equipment: 100, lastSettledAt: 0 }; }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function known(value: unknown, catalog: FinishDef[], fallback: string): string {
  return typeof value === "string" && catalog.some((f) => f.id === value) ? value : fallback;
}
export function sanitizeDesign(value: unknown, width = 64, height = 64): RestaurantDesign {
  const src = record(value), defaults = defaultDesign(), storefront = record(src.storefront);
  const design: RestaurantDesign = {
    floor: known(src.floor, FLOOR_FINISHES, defaults.floor),
    wall: known(src.wall, WALL_FINISHES, defaults.wall), tiles: {}, wallTiles: {},
    storefront: {
      awning: known(storefront.awning, AWNINGS, defaults.storefront.awning),
      sign: typeof storefront.sign === "string" ? storefront.sign.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").trim().slice(0, 24) : "",
    },
  };
  for (const [key, id] of Object.entries(record(src.tiles)).slice(0, width * height)) {
    if (!/^\d+,\d+$/.test(key)) continue;
    const [x, y] = key.split(",").map(Number);
    if (x >= width || y >= height || key !== `${x},${y}`) continue;
    const finish = known(id, FLOOR_FINISHES, "");
    if (finish) design.tiles[key] = finish;
  }
  for (const [key, id] of Object.entries(record(src.wallTiles)).slice(0, width + height)) {
    if (!/^(left|right),\d+$/.test(key)) continue;
    const [side, index] = key.split(",");
    if (Number(index) >= (side === "left" ? height : width) || key !== `${side},${Number(index)}`) continue;
    const finish = known(id, WALL_FINISHES, "");
    if (finish) design.wallTiles[key] = finish;
  }
  return design;
}
export function sanitizeMaintenance(value: unknown): MaintenanceState {
  const src = record(value);
  const clamp = (v: unknown, fallback: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback;
  return { cleanliness: clamp(src.cleanliness, 100, 100), equipment: clamp(src.equipment, 100, 100), lastSettledAt: Math.floor(clamp(src.lastSettledAt, 0, Number.MAX_SAFE_INTEGER)) };
}
