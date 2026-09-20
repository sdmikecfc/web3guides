"use client";
import { DINER_RULES, dinerRates, staffSlots, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import { DinerIcon } from './DinerIcon';
import css from './diner.module.css';

export function HomeGrowth({ state, send, open }: { state: DinerState; send: (command: DinerCommand) => boolean; open: (panel: 'catalogue' | 'recipes' | 'staff' | 'map') => void }) {
  const next = state.home.expansion + 1, full = next >= DINER_RULES.floors.length;
  const level = DINER_RULES.expansionLevels[next], price = DINER_RULES.expansionPrices[next];
  const rates = dinerRates(state), buzz = state.buzz.filter(at => state.updatedAt >= at && state.updatedAt - at < DINER_RULES.buzzHours * DINER_RULES.hourMs).length;
  const counts = { chefs: state.home.staff.chefs, waiters: state.home.staff.waiters };
  return <>
    <div className={css.statBox}><span className={css.eyebrow}>Your next building project</span><strong>{full ? 'Your full-size diner' : `${state.home.w} × ${state.home.h} → ${DINER_RULES.floors[next]} × ${DINER_RULES.floors[next]}`}</strong>
      <p className={css.small}>{full ? 'There is room for your whole collection.' : 'More floor space for tables, machines and the little things that make it yours. Existing furniture stays in place.'}</p>
      {!full && <><p className={css.small}>{state.restaurantLevel >= level ? '✓' : '○'} Restaurant level {level} · currently {state.restaurantLevel}<br />{state.coins >= price ? '✓' : '○'} {price.toLocaleString()} coins · you have {Math.floor(state.coins).toLocaleString()}</p><button className={css.primary} disabled={state.restaurantLevel < level || state.coins < price} onClick={() => send({ type: 'expandHome' })}>Expand restaurant · {price.toLocaleString()} coins</button><p className={css.tiny}>Collect the till and cook truck lunches to earn reputation for restaurant levels.</p></>}
    </div>
    <h3 className={css.sectionTitle}>Bring your diner to life</h3>
    <p className={css.panelLead}>{rates.coins > 0 ? `Your current layout can earn about ${Math.round(rates.coins)} coins per hour while open.` : 'Your kitchen needs a usable machine, staff and reachable dining seats before it can serve.'} {rates.bottleneck === 'arrivals' ? 'You have capacity to spare. Build a reputation to bring more guests through the door.' : rates.bottleneck === 'seats' ? 'Dining seats are your current limit. Add reachable tables before hiring more staff.' : rates.bottleneck === 'kitchen' ? 'The kitchen is your current limit. Check your machines and cooking crew.' : 'Serving is your current limit. Give waiters clear routes and add help when you have a crew slot.'}</p>
    <div className={css.list}>
      <div className={css.row}><DinerIcon name="book" /><div><h3>Make a house favourite</h3><p>Upgrade the recipes your diner serves. Mastery improves their value and attracts more customers.</p></div><button className={css.button} onClick={() => open('recipes')}>Cookbook</button></div>
      <div className={css.row}><DinerIcon name="truck" /><div><h3>Get the neighbourhood talking</h3><p>Complete a truck service for a four-hour visit boost. {buzz ? `${buzz} of ${DINER_RULES.buzzMax} boosts active.` : 'No truck-service boosts are active yet.'}</p></div><button className={css.button} onClick={() => open('map')}>Take the truck</button></div>
      <div className={css.row}><DinerIcon name="decorate" /><div><h3>Make room for a better lunch</h3><p>Tables add seats; discovered machines add dishes. Different decorations give a small customer boost. Floor and wall colors are for looks.</p></div><button className={css.button} onClick={() => open('catalogue')}>Shop</button></div>
      <div className={css.row}><DinerIcon name="friends" /><div><h3>Care for your crew</h3><p>{counts.chefs} chef{counts.chefs === 1 ? '' : 's'} · {counts.waiters} waiter{counts.waiters === 1 ? '' : 's'} · {staffSlots(state)} total crew slots. A daily staff meal makes the team 10% faster.</p></div><button className={css.button} onClick={() => open('staff')}>Crew</button></div>
    </div>
    <p className={css.notice}>More furniture means more capacity, not instant crowds. Recipe mastery, restaurant levels, decoration and a little truck-service buzz grow demand.</p>
  </>;
}
