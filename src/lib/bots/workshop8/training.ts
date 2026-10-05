export const TRAINING_VERSION = 'mk8-training-1';
/** An explicit tutorial profile; normal combat and its recorded versions stay untouched. */
export function prepareTraining(engine: { actors: { meter: number; nextAction: number; nextDefence: number }[] }) {
  engine.actors[0].meter = 100;
  engine.actors[1].nextAction = 300;
  engine.actors[1].nextDefence = 300;
}
