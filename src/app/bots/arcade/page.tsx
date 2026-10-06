import ArcadeGarage from '../_game/ArcadeGarage';
import {modelKombatMetadata} from '@/lib/bots/social-metadata';
export const metadata=modelKombatMetadata('/bots/arcade','Model Kombat · Arcade','A free cartoon robot fighting game. Play with touch, keyboard or mouse. Arcade practice is unrewarded.','games');
export default function ArcadePage(){return <ArcadeGarage/>;}
