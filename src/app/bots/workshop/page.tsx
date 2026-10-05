import { Suspense } from "react";
import ConnectedWorkshop from "../_game/ConnectedWorkshop";

export const metadata = {
  title: { absolute: "Model Kombat — Build your robot. Find your fight." },
  description: "Build a robot, choose its weapons and time its special in battle. Earn game coins for your next fighter. Free to start, with no wallet or crypto required.",
};
export default function WorkshopPage() {
  return <Suspense fallback={null}><ConnectedWorkshop journeyPreview={process.env.BOTS_WORKSHOP_JOURNEY==='1'} competitionPreview={process.env.BOTS_WORKSHOP_COMPETITION==='1'&&process.env.BOTS_WORKSHOP_JOURNEY==='1'} /></Suspense>;
}
