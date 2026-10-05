"use client";

import { useState } from "react";
import { EQUIPMENT_BY_ID, INGREDIENT_BY_ID, RECIPES, RECIPE_BY_ID, ROUTES, recipePrice } from "@/lib/chef/diner/content";
import { DINER_RULES, menuSlots, autoHomeRecipeIds, type DinerCommand, type DinerState } from "@/lib/chef/diner/progression";
import type { Course, RecipeDef } from "@/lib/chef/diner/types";
import { DinerIcon } from "./DinerIcon";
import { isKitRecipe } from '@/lib/chef/diner/recipe-progression';
import { RecipeLearning, recipeEquipmentHint } from './RecipeLearning';
import { IngredientArt } from "./IngredientArt";
import { ModelIcon } from "./ModelIcon";
import css from "./recipe-book.module.css";

export interface RecipeBookProps {
  state: DinerState;
  initialRecipeId?: string|null;
  send: (command: DinerCommand) => boolean;
  openPantry: () => void;
}

const COURSE_NAMES: Record<Course, string> = { starter: "Starter", main: "Main course", dessert: "Dessert", drink: "Drink" };
const DISCOVERIES = [
  { id: "starter", name: "Burger favourites", hint: "Start with classic burger. Look for a fries recipe and a fryer as separate roadside finds." },
  ...ROUTES.map(route => ({ id: route.id, name: route.name, hint: `${route.name} favourites. Roadside markets offer a small random selection; recipes begin at your second market. Equipment is a separate purchase.` })),
  { id: "secret", name: "Secret recipes", hint: "Collect three matching recipe scraps to learn a secret dish." },
];

/** The binder's contents; its parent owns the modal and close/focus behavior. */
export function RecipeBook({ state, initialRecipeId, send, openPantry }: RecipeBookProps) {
  const owned = RECIPES.filter(recipe => Object.hasOwn(state.recipes, recipe.id));
  const [selectedId, setSelectedId] = useState(owned.some(recipe=>recipe.id===initialRecipeId)?initialRecipeId!:owned[0]?.id ?? "classic_burger");
  const [discoveryId, setDiscoveryId] = useState("downtown");
  // Account changes can replace the collection while this panel remains open.
  const selected = owned.find(recipe => recipe.id === selectedId) ?? owned[0];
  const learned = owned.length, automatic=autoHomeRecipeIds(state);
  const equipmentDriven=isKitRecipe;
  const mastered = owned.filter(recipe => state.recipes[recipe.id].level >= DINER_RULES.maxDishLevel).length;
  const discovery = DISCOVERIES.find(route => route.id === discoveryId) ?? DISCOVERIES[0];
  const discoverable = RECIPES.filter(recipe => recipe.route === discovery.id);

  const setHomeRecipe = (recipe: RecipeDef) => {
    const menu = structuredClone(state.home.menu), current = menu[recipe.course];
    menu[recipe.course] = current.includes(recipe.id)
      ? current.filter(id => id !== recipe.id)
      : [...(current.length >= menuSlots(state) ? current.slice(1) : current), recipe.id];
    send({ type: "setHomeMenu", menu });
  };

  return <div className={css.book}>
    <div className={css.collectionHeading}>
      <div><span className={css.eyebrow}>Made your own</span><h3>Your recipes <span>{learned}<small> / {RECIPES.length}</small></span></h3></div>
      <span className={css.masteredCount}><DinerIcon name="star" size={17} />{mastered} mastered</span>
    </div>
    <p className={css.discoveryHint}>Use saved pantry ingredients to improve dishes permanently. Each upgrade uses one of every ingredient shown and increases the coins earned per serving.</p>
    {state.rally.service?<p className={css.discoveryHint}>These are your permanent recipes. Everyone keeps the same loaned recipe levels in the rally.</p>:state.run?.service&&<p className={css.discoveryHint}>Upgrades improve your restaurant and next cooking day. The current truck service keeps its starting recipe levels.</p>}

    <div className={css.recipeRail} aria-label="Choose one of your recipes">
      {owned.map(recipe => {
        const level = state.recipes[recipe.id].level, active = automatic.includes(recipe.id)||state.home.menu[recipe.course].includes(recipe.id);
        return <button key={recipe.id} type="button" className={`${css.recipeTab} ${selected?.id === recipe.id ? css.selectedTab : ""}`} aria-pressed={selected?.id === recipe.id} onClick={() => setSelectedId(recipe.id)}>
          <span className={css.tabArt}><ModelIcon kind="food" recipeId={recipe.id} mastery={level} label="" size={76} />{active && <span className={css.onMenuDot} title="On your home menu"><DinerIcon name="check" size={12} /></span>}</span>
          <strong>{recipe.name}</strong><small>{level >= DINER_RULES.maxDishLevel ? "Mastered" : `Level ${level}`}{active ? " · On menu" : ""}</small>
        </button>;
      })}
    </div>

    {selected ? (() => {
      const level = state.recipes[selected.id].level, isMastered = level >= DINER_RULES.maxDishLevel;
      const currentPrice = recipePrice(selected.id, level), nextPrice = recipePrice(selected.id, level + 1);
      const ingredientsReady = selected.ingredients.every(id => (state.pantry[id] ?? 0) >= 1);
      const active = automatic.includes(selected.id)||state.home.menu[selected.course].includes(selected.id);
      const missingStations = [...new Set(selected.steps.map(step => step.station))].filter(station => !state.home.layout.some(piece => piece.equipmentId === station));
      const truckChosen=(state.run?.menu??state.truckConfig.menu).includes(selected.id);
      const currentCourse = state.home.menu[selected.course];
      const replacement = !active && currentCourse.length >= menuSlots(state) ? RECIPE_BY_ID[currentCourse[0]] : undefined;
      const menuLabel = active ? "Remove from home menu" : replacement ? `Serve instead of ${replacement.name}` : "Add to home menu";
      return <article className={css.recipePage} aria-label={selected.name}>
        <div className={css.illustrationPage}>
          <div className={css.plateCaption}><span>{COURSE_NAMES[selected.course]}</span><span>No. {String(RECIPES.findIndex(recipe => recipe.id === selected.id) + 1).padStart(2, "0")}</span></div>
          <div className={css.heroArt}><ModelIcon kind="food" recipeId={selected.id} mastery={level} label={selected.name} size={252} /></div>
          <div className={`${css.dishStamp} ${isMastered ? css.masteredStamp : ""}`}><DinerIcon name={isMastered ? "star" : "heart"} size={20} /><span>{isMastered ? "House masterpiece" : level >= 3 ? "Signature plate" : level === 0 ? "A new favorite" : "Made with love"}</span></div>
          <div className={css.servingPrice}><DinerIcon name="coin" size={24} /><strong>{currentPrice}</strong><span>per serving</span></div>
        </div>

        <div className={css.recipeDetails}>
          <div className={css.recipeTitle}><span className={css.eyebrow}>From your kitchen</span><h3>{selected.name}</h3></div>
          <div className={css.mastery}>
            <div className={css.masteryHeading}><strong>{isMastered ? "Recipe mastered" : `Mastery level ${level}`}</strong><span>{level} / {DINER_RULES.maxDishLevel}</span></div>
            <div className={css.masteryTrack} role="progressbar" aria-label={`${selected.name} mastery`} aria-valuemin={0} aria-valuemax={DINER_RULES.maxDishLevel} aria-valuenow={level}>
              {Array.from({ length: DINER_RULES.maxDishLevel }, (_, index) => <span key={index} className={index < level ? css.filledPip : undefined} />)}
            </div>
            <p className={css.platingGoal}>{isMastered?'Served on your golden house plate.':level>=3?'Golden plating at level 10.':'Signature plating at level 3.'}</p>
          </div>

          {!isMastered ? <>
            <div className={css.nextPrice}><span>Next level earns</span><strong><DinerIcon name="coin" size={18} />{nextPrice}<small>per serving</small></strong><b>+{nextPrice - currentPrice}</b></div>
            <div className={css.ingredientsHeading}><h4>For level {level + 1}</h4><button type="button" onClick={openPantry}>Open pantry<DinerIcon name="arrow" size={15} /></button></div>
            <ul className={css.ingredients}>
              {selected.ingredients.map(id => {
                const stock = state.pantry[id] ?? 0, name = INGREDIENT_BY_ID[id]?.name ?? id;
                return <li key={id} className={stock >= 1 ? css.ingredientReady : css.ingredientMissing}>
                  <IngredientArt id={id} size={42} /><span><strong>{name}</strong><small>Need 1 · Have {stock}</small></span><span className={css.ingredientMark} aria-label={stock >= 1 ? "Enough in pantry" : "Missing ingredient"}>{stock >= 1 ? <DinerIcon name="check" size={16} /> : "1"}</span>
                </li>;
              })}
            </ul>
            <button type="button" className={css.upgradeButton} disabled={!ingredientsReady} aria-describedby="recipe-upgrade-note" onClick={() => send({ type: "upgradeRecipe", recipeId: selected.id })}><DinerIcon name="star" size={20} />Upgrade to level {level + 1}</button>
            <p id="recipe-upgrade-note" className={css.upgradeNote}>{ingredientsReady ? "Uses one of each ingredient shown above." : "Collect the missing ingredients to upgrade this recipe."}</p>
          </> : <div className={css.masteredNote}><DinerIcon name="star" size={30} /><div><strong>A recipe to be proud of.</strong><p>All ten upgrades complete. This dish earns {currentPrice} kitchen coins per serving.</p></div></div>}

          <div className={css.menuSection}>
            <div className={css.menuStatus}><DinerIcon name="truck" size={18}/><strong>{truckChosen?'On your truck menu':'Your truck kitchen'}</strong></div>
            <p className={css.menuNote}>{recipeEquipmentHint(state,selected.id)} {!truckChosen&&'Use Choose menu in truck preparation when you want to serve this dish.'}</p>
            <div className={css.menuStatus}><DinerIcon name="home" size={18} /><strong>{active ? "On your home menu" : "Your home menu"}</strong><span>{equipmentDriven(selected.id)?'Equipment-driven':`${currentCourse.length} / ${menuSlots(state)} ${selected.course} slots`}</span></div>
            {equipmentDriven(selected.id)?<p className={css.menuNote}>Your crew serves this dish automatically when its machines are placed, working and reachable. Store the boiler to stop new noodle orders.</p>:<button type="button" className={`${css.menuButton} ${active ? css.activeMenuButton : ""}`} disabled={!active && missingStations.length > 0} onClick={() => setHomeRecipe(selected)}>{active ? <DinerIcon name="check" size={18} /> : <DinerIcon name="plate" size={18} />}{menuLabel}</button>}
            {missingStations.length > 0 && <p className={css.menuNote}>Place {missingStations.map(id => EQUIPMENT_BY_ID[id]?.name ?? id).join(" and ")} at home to serve this dish.</p>}
          </div>
        </div>
      </article>;
    })() : <p className={css.empty}>Your first recipes will appear here.</p>}

    <RecipeLearning state={state}/>
    <section className={css.discovery} aria-label="Recipes to discover">
      <div className={css.discoveryHeading}><div><span className={css.eyebrow}>Room for more favorites</span><h3>Out there, waiting for you</h3></div><DinerIcon name="book" size={28} /></div>
      <div className={css.routeRail} aria-label="Browse recipes by route">{DISCOVERIES.map(route => {
        const recipes = RECIPES.filter(recipe => recipe.route === route.id), count = recipes.filter(recipe => Object.hasOwn(state.recipes, recipe.id)).length;
        return <button key={route.id} type="button" aria-pressed={discovery.id === route.id} className={discovery.id === route.id ? css.selectedRoute : undefined} onClick={() => setDiscoveryId(route.id)}>{route.name}<small>{count}/{recipes.length}</small></button>;
      })}</div>
      <p className={css.discoveryHint}>{discovery.hint}</p>
      <ul className={css.discoveryRail}>
        {discoverable.map(recipe => {
          const known = Object.hasOwn(state.recipes, recipe.id);
          return <li key={recipe.id} className={known ? css.discovered : undefined}>
            <div className={css.discoveryArt}><ModelIcon kind="food" recipeId={recipe.id} mastery={state.recipes[recipe.id]?.level??0} label="" size={80} />{known && <span><DinerIcon name="check" size={13} /></span>}</div>
            <strong>{recipe.name}</strong><small>{known ? "In your cookbook" : recipe.secret ? `${state.collections.scraps[recipe.id] ?? 0} / 3 scraps` : "Find at roadside markets"}</small>
          </li>;
        })}
      </ul>
    </section>
  </div>;
}
