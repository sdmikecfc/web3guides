import type { KitchenCommand } from "@/lib/chef/authority";
import { TRUCK_COMMAND_RULES } from "../../../../lib/chef/truck-authority";
import type { TruckAction } from "../_engine/truck";

const barriers = new Set(["start", "resume", "pause", "abandon", "finish", "marketVisit"]);
export function isTruckCommand(command: KitchenCommand | null): command is Extract<KitchenCommand, { type: "truck" | "truckBatch" }> {
  return command?.type === "truck" || command?.type === "truckBatch";
}
/** Consume one bounded tape. Lifecycle inputs get their own server receipt;
 * ticks after starting/resuming wait until that receipt establishes the clock. */
export function takeTruckBatch(queue: TruckAction[]): TruckAction[] {
  const batch: TruckAction[] = [];
  let ticks = 0;
  while (queue.length && batch.length < TRUCK_COMMAND_RULES.maxActions) {
    const next = queue[0];
    if (barriers.has(next.type)) {
      if (!batch.length) batch.push(queue.shift()!);
      break;
    }
    if (next.type === "tick") {
      const count = Math.min(next.ticks, TRUCK_COMMAND_RULES.maxTicks - ticks);
      if (count <= 0) break;
      batch.push({ type: "tick", ticks: count }); ticks += count;
      if (count < next.ticks) { queue[0] = { type: "tick", ticks: next.ticks - count }; break; }
    } else batch.push(next);
    queue.shift();
  }
  return batch;
}
