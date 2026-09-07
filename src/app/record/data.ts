/**
 * THE RECORD - static history (Seasons 1-4 final; S5 GRADUATED to final
 * 2026-08-22 after it settled and paid; the 6 Aug snapshot it used to carry
 * was a day-3-of-14 picture of a season that has since finished),
 * transcribed from Documents/Doma/Launch-Wars-Record.html via double-blind
 * extraction (two independent passes + diff; run wf_d2f52037). Live seasons
 * are joined at render time in page.tsx; when a season settles, its final
 * numbers graduate into these tables.
 */
export interface SeasonRow {
  key: string;
  theme: string;
  pool: string;
  players: number;
  qualified: number;
  bonded: string;
  held: string;
  posts: number;
  fdv: string;
}
export interface DomainRow {
  season: string;
  domain: string;
  status: string;
  listedAt: string;
  bondTarget: string;
  peakFdv: string;
  ofTarget: string;
  prize: string;
}
export interface PaymentRow {
  batch: string;
  wallets: number;
  paid: string;
  failed: number;
  announced: string;
}

// EVERY confirmed transfer to a player, summed from scripts/payouts/*.jsonl
// (last status per wallet, penny + selftest batches excluded):
//   S1 $895/73 · S2 $1,000/39 · S3 $850/66 · S4 $504/50
//   S5 $22/20 (hotcommerce bounty) + $700/51 (final settlement) + $30/1 (Warhawks)
// Updated 2026-08-22: was $3,271/248, which predated everything S5 paid.
export const THESIS = { paidTotal: "$4,001", transfers: 300, bondedNum: 21, bondedDen: 38, fdvLocked: "~$75K" };

export const SEASONS: SeasonRow[] = [
  { key: "S1", theme: "Pilot", pool: "$895", players: 156, qualified: 60, bonded: "7 / 8", held: "$611", posts: 338, fdv: "~$16.6K" },
  { key: "S2", theme: "Conquer the Seas", pool: "$1,000", players: 125, qualified: 38, bonded: "3 / 5", held: "$662", posts: 381, fdv: "~$3.1K" },
  { key: "S3", theme: "Starfall", pool: "$850", players: 111, qualified: 62, bonded: "4 / 5", held: "$1,734", posts: 347, fdv: "~$51.5K" },
  { key: "S4", theme: "The Hit List", pool: "$504", players: 89, qualified: 49, bonded: "5 / 10", held: "$839", posts: 373, fdv: "~$1.7K" },
  // S5 FINAL (graduated 2026-08-22 from the day-3 snapshot). Pool = CONFIRMED
  // PAID per this table's own rule: $700 settlement + $22 hotcommerce bounty.
  // The $1,000 it used to show was the envelope, never what went out.
  { key: "S5", theme: "Iron Siege", pool: "$722", players: 73, qualified: 51, bonded: "2 / 10", held: "$1,567", posts: 129, fdv: "~$1.7K" }
];

export const DOMAINS: DomainRow[] = [
  { season: "S2", domain: "warriors.xyz", status: "BONDED", listedAt: "$2,000", bondTarget: "$2,500", peakFdv: "$3,417", ofTarget: "137%", prize: "pooled" },
  { season: "S2", domain: "realityapps.com", status: "BONDED", listedAt: "$2,500", bondTarget: "$5,000", peakFdv: "$5,566", ofTarget: "111%", prize: "pooled" },
  { season: "S2", domain: "rackets.xyz", status: "BONDED", listedAt: "$750", bondTarget: "$875", peakFdv: "$2,347", ofTarget: "268%", prize: "pooled" },
  { season: "S2", domain: "recertify.ai", status: "FAILED", listedAt: "$3,400", bondTarget: "$5,900", peakFdv: "$4,474", ofTarget: "76%", prize: "$0" },
  { season: "S2", domain: "bottoken.com", status: "FAILED", listedAt: "$2,500", bondTarget: "$5,000", peakFdv: "$4,232", ofTarget: "85%", prize: "$0" },
  { season: "S3", domain: "smoothie.com", status: "BONDED", listedAt: "$300,000", bondTarget: "$350,000", peakFdv: "$571,429", ofTarget: "163%", prize: "pooled" },
  { season: "S3", domain: "cosmo.xyz", status: "BONDED", listedAt: "$1,750", bondTarget: "$3,000", peakFdv: "$3,000", ofTarget: "100%", prize: "pooled" },
  { season: "S3", domain: "uncage.xyz", status: "BONDED", listedAt: "$250", bondTarget: "$350", peakFdv: "$751", ofTarget: "215%", prize: "pooled" },
  { season: "S3", domain: "earmarking.xyz", status: "BONDED", listedAt: "$100", bondTarget: "$250", peakFdv: "$840", ofTarget: "336%", prize: "pooled" },
  { season: "S3", domain: "frenchfries.ai", status: "FAILED", listedAt: "$1,300", bondTarget: "$2,600", peakFdv: "$1,866", ofTarget: "72%", prize: "$0" },
  { season: "S3", domain: "cresting.xyz", status: "BONDED", listedAt: "$50", bondTarget: "$100", peakFdv: "$100", ofTarget: "100%", prize: "$50" },
  { season: "S3", domain: "goldspiders.com", status: "FAILED", listedAt: "$3,600", bondTarget: "$5,000", peakFdv: "$3,921", ofTarget: "78%", prize: "$0" },
  { season: "S3", domain: "millionpixelgrid.com", status: "FAILED", listedAt: "$5,000", bondTarget: "$10,000", peakFdv: "$6,954", ofTarget: "70%", prize: "$0" },
  { season: "S3", domain: "gradai.com", status: "FAILED", listedAt: "$1,750", bondTarget: "$3,500", peakFdv: "$2,482", ofTarget: "71%", prize: "$0" },
  { season: "S4", domain: "kissme.ai", status: "BONDED", listedAt: "$2,500", bondTarget: "$3,200", peakFdv: "$3,198", ofTarget: "100%", prize: "$128" },
  { season: "S4", domain: "assetsplanet.com", status: "BONDED", listedAt: "$300", bondTarget: "$600", peakFdv: "$615", ofTarget: "102%", prize: "$128" },
  { season: "S4", domain: "bballz.com", status: "BONDED", listedAt: "$500", bondTarget: "$750", peakFdv: "$1,140", ofTarget: "152%", prize: "$90" },
  { season: "S4", domain: "dubaibanx.com", status: "BONDED", listedAt: "$250", bondTarget: "$500", peakFdv: "$903", ofTarget: "181%", prize: "$90" },
  { season: "S4", domain: "earmarkings.com", status: "BONDED", listedAt: "$200", bondTarget: "$400", peakFdv: "$744", ofTarget: "186%", prize: "$64" },
  { season: "S4", domain: "gasfee.ai", status: "FAILED", listedAt: "$7,500", bondTarget: "$10,000", peakFdv: "$9,050", ofTarget: "90%", prize: "$0" },
  { season: "S4", domain: "stablechain.io", status: "FAILED", listedAt: "$1,750", bondTarget: "$3,500", peakFdv: "$3,102", ofTarget: "89%", prize: "$0" },
  { season: "S4", domain: "myfarm.ai", status: "FAILED", listedAt: "$2,500", bondTarget: "$5,000", peakFdv: "$4,388", ofTarget: "88%", prize: "$0" },
  { season: "S4", domain: "chainify.ai", status: "FAILED", listedAt: "$2,500", bondTarget: "$5,000", peakFdv: "$4,188", ofTarget: "84%", prize: "$0" },
  { season: "S4", domain: "capitalized.com", status: "FAILED", listedAt: "$6,000", bondTarget: "$9,500", peakFdv: "$7,856", ofTarget: "83%", prize: "$0" },
  { season: "S5", domain: "hotcommerce.com", status: "BONDED", listedAt: "$750", bondTarget: "$1,500", peakFdv: "$1,689", ofTarget: "113%", prize: "$17 + $22" },
  { season: "S5", domain: "fyi.xyz", status: "FAILED", listedAt: "$25,000", bondTarget: "$35,000", peakFdv: "$27,197", ofTarget: "78%", prize: "$175 + $60" },
  { season: "S5", domain: "hypnotise.ai", status: "FAILED", listedAt: "$2,500", bondTarget: "$3,200", peakFdv: "$2,895", ofTarget: "90%", prize: "$16 + $22" },
  { season: "S5", domain: "deprogram.com", status: "FAILED", listedAt: "$2,000", bondTarget: "$2,500", peakFdv: "$2,293", ofTarget: "92%", prize: "$12 + $22" },
  // walletz.xyz BONDED after the 6 Aug snapshot: S5's second and last.
  { season: "S5", domain: "walletz.xyz", status: "BONDED", listedAt: "$1,200", bondTarget: "$2,100", peakFdv: "$2,100", ofTarget: "100%", prize: "$30 + $24" },
  { season: "S5", domain: "norules.ai", status: "FAILED", listedAt: "$6,250", bondTarget: "$12,500", peakFdv: "$7,828", ofTarget: "63%", prize: "$145 + $42" },
  { season: "S5", domain: "vaultpool.com", status: "LIVE", listedAt: "$7,500", bondTarget: "$11,000", peakFdv: "$8,114", ofTarget: "74%", prize: "$81 + $32" },
  { season: "S5", domain: "applications.com", status: "LIVE", listedAt: "$200,000", bondTarget: "$225,000", peakFdv: "$205,988", ofTarget: "92%", prize: "$175 + $30" },
  { season: "S5", domain: "datafinder.ai", status: "LIVE", listedAt: "$2,000", bondTarget: "$3,000", peakFdv: "$2,381", ofTarget: "79%", prize: "$23 + $22" },
  { season: "S5", domain: "geoquest.xyz", status: "LIVE", listedAt: "$4,000", bondTarget: "$5,000", peakFdv: "$4,223", ofTarget: "84%", prize: "$26 + $24" }
];

export const PAYMENTS: PaymentRow[] = [
  { batch: "S1", wallets: 73, paid: "$895.00", failed: 0, announced: "-" },
  { batch: "S2", wallets: 39, paid: "$1,000.00", failed: 0, announced: "-" },
  { batch: "S3", wallets: 66, paid: "$850.00", failed: 0, announced: "$800 to 62" },
  { batch: "S4", wallets: 50, paid: "$504.00", failed: 0, announced: "$500 to 49" },
  { batch: "S5", wallets: 20, paid: "$22.00", failed: 0, announced: "first bounty" },
  { batch: "S5 final", wallets: 51, paid: "$700.00", failed: 0, announced: "$700 to 51" },
  { batch: "S5 Warhawks", wallets: 1, paid: "$30.00", failed: 0, announced: "top score" }
];

/** The unlisted access key: /record?k=<this>. Team-tier secrecy (unguessable
 * link), not cryptographic; rotate by editing this constant. */
export const RECORD_KEY = "uprising-ledger-7x4k9";
