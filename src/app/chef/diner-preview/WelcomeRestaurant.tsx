'use client';
import {useMemo} from 'react';
import {createDiner} from '@/lib/chef/diner/progression';
import {quietRestaurantScene} from './quiet-view';
import DinerScene from './DinerScene';
/** A throwaway starter room. It never reads or writes a player's save. */
export default function WelcomeRestaurant(){
 const scene=useMemo(()=>({...quietRestaurantScene(createDiner(0,'welcome-room')),previewInset:16}),[]);
 return <DinerScene mode="home" scene={scene} rotation={0} onTarget={()=>{}} onTile={()=>{}} showWorldHints={false}/>;
}
