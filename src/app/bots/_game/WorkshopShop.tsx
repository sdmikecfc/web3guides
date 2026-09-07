"use client";

import { useEffect, useMemo, useState } from "react";
import CabinetShop from "../shop/CabinetShop";
import type { MeView } from "../_server/types";
import { msToNextShipment, shipmentFor, type Listing } from "@/lib/bots/shipment";
import type { GarageState } from "@/lib/bots/garage-state";
import { cabinetShipment } from "@/lib/bots/workshop-views";

/** The original cabinet, controlled by the shell's single inventory and purse. */
export default function WorkshopShop({ me, spendable, introductory, onResume, onEarn, onBuy, onReload }: {
  me: MeView | null; spendable: number; introductory: boolean;
  onResume: () => void; onEarn: () => void; onBuy: (listing: Listing) => Promise<void>; onReload: () => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const day = me?.day ?? (now ? new Date(now).toISOString().slice(0, 10) : "");
  const shipment = useMemo(() => me ? cabinetShipment(me.shop) : day ? shipmentFor(day) : null, [me?.shop, day]);
  const state = useMemo<GarageState>(() => ({ v: 1, equipmentVersion: 2, coins: spendable, level: me?.player.level ?? 1,
    parts: [], builds: {}, bays: {}, crew: [], nextUid: 0,
    bought: { [day]: me?.shop.listings.filter(l => l.bought).map(l => l.id) ?? [] },
  }), [spendable, me?.player.level, me?.shop.listings, day]);
  const expired = !!me && !!now && day !== new Date(now).toISOString().slice(0, 10);
  const browseOnly = expired ? { label: "Unpack the new shipment", message: "A new day has arrived. Refresh the shelf before buying.", onAction: onReload }
    : introductory ? { label: "Continue my first build", message: "Your 250 starter coins are kept for the beginner parts. Come back here after your first practice.", onAction: onResume }
    : !me ? { label: "How to earn more coins", message: "Look around the whole shop. Connect to buy parts with coins from verified trades.", onAction: onEarn } : undefined;
  return <CabinetShop embedded shipment={shipment} st={state} day={day} initialSlot={null}
    leftMs={now ? msToNextShipment(now) : null} tomorrow="" returns="" toast={null} onBuy={onBuy} browseOnly={browseOnly} />;
}
