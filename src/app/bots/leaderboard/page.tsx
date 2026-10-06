import TokenZoneBoard from '../_game/TokenZoneBoard';
import {modelKombatMetadata} from '@/lib/bots/social-metadata';
export const metadata=modelKombatMetadata('/bots/leaderboard','Token zones & leaderboards | Model Kombat','Climb nine reward zones together. Shared token rewards initially valued at approximately $4,000, unlocked by verified domain-token trading. Eligibility and volume targets apply.');
export default function Page(){return <main><TokenZoneBoard/></main>}
