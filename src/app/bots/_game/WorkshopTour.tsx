"use client";
import { useState, type ReactNode } from "react";
import EntryDialog from "./EntryDialog";
import WorkshopLesson, { type LessonTopic } from "./WorkshopLesson";
import css from "./workshop-lesson.module.css";

export const WORKSHOP_TOUR_VERSION = 1;
export const WORKSHOP_TOUR_KEY = "bots.workshop-tour.seen.v1";
const topics: LessonTopic[] = ["build", "styles", "special", "season"];
export default function WorkshopTour({ returning, robotName, robotPreview, onClose, onBuild }: { returning: boolean; robotName?: string; robotPreview?: ReactNode; onClose: () => void; onBuild: () => void }) {
  const [step, setStep] = useState(0);
  return <EntryDialog title={returning ? "Welcome back to the workshop." : "Let’s show you around."} onClose={onClose}>
    <div className={css.tour}><div className={css.tourTop}><span>{returning ? "WHAT’S NEW" : "YOUR QUICK TOUR"} · {step + 1} OF {topics.length}</span><div className={css.dots}>{topics.map((topic, i) => <i key={topic} data-active={i === step} />)}</div></div>
      {robotPreview && <div className={css.tourRobot}><div>{robotPreview}</div><p><strong>{robotName}</strong><br />Your saved robot is still yours.</p></div>}
      <WorkshopLesson topic={topics[step]} compact />
      <p className={css.tourNote}>{robotName ? `${robotName} and your saved collection are still yours. ` : ""}This tour changes no robots, parts or coins.</p>
      <div className={css.tourActions}><button onClick={step ? () => setStep(step - 1) : onClose}>{step ? "Back" : "Look around myself"}</button><button onClick={step < topics.length - 1 ? () => setStep(step + 1) : onBuild}>{step < topics.length - 1 ? "Next" : returning ? "Open my garage" : "Let’s build"}</button></div>
    </div>
  </EntryDialog>;
}
