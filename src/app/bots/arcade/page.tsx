import ArcadeGarage from '../_game/ArcadeGarage';
import {modelKombatMetadata} from '@/lib/bots/social-metadata';
export const metadata=modelKombatMetadata('/bots/arcade','Model Kombat · Arcade','Six rivals. Three lives. One boss. Play free with touch, keyboard or mouse. No coins or prize points.','games');
export default function ArcadePage(){return <ArcadeGarage/>;}
