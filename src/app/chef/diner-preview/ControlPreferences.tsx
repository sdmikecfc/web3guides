"use client";
import {createContext,useContext,useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import {DEFAULT_CONTROLS,controlPreferences,type ControlPreferences as Preferences} from '@/lib/chef/diner/controls';
import {useDinerAccess} from './DinerAccess';
import {betaStorageKeys} from './beta-access';
import css from './diner.module.css';
import styles from './control-preferences.module.css';
const Context=createContext({controls:DEFAULT_CONTROLS,setControls:(_patch:Partial<Preferences>)=>{}});
export const useControls=()=>useContext(Context);
export function ControlHelp(){const {controls}=useControls(),[touch,setTouch]=useState(false);useEffect(()=>{const m=window.matchMedia('(pointer: coarse)'),update=()=>setTouch(m.matches);update();m.addEventListener('change',update);return()=>m.removeEventListener('change',update);},[]);return <p className={css.small}>{touch?'Tap a station or seat to walk and interact.':'Click a station or seat; WASD or arrows move, E works.'} {controls.work==='toggle'?'Tap work to start or stop one task.':'Hold work to prepare or wash; release to stop.'} You can pause anytime.</p>;}
export function ControlPreferencesProvider({children}:{children:ReactNode}){
 const access=useDinerAccess(),key=`${access?.mode==='beta'?betaStorageKeys(access.wallet).preferences:'dk-diner-preferences'}:controls-v1`;
 const [controls,setValue]=useState(DEFAULT_CONTROLS),[loaded,setLoaded]=useState('');
 useEffect(()=>{try{setValue(controlPreferences(JSON.parse(localStorage.getItem(key)??'null')));}catch{setValue(DEFAULT_CONTROLS);}setLoaded(key);},[key]);
 useEffect(()=>{if(loaded===key)try{localStorage.setItem(key,JSON.stringify(controls));}catch{}},[controls,key,loaded]);
 return <Context.Provider value={{controls,setControls:patch=>setValue(p=>controlPreferences({...p,...patch}))}}><div className={styles.scope} data-dk-access data-large-controls={controls.large} data-control-hand={controls.hand} style={{'--dk-text-scale':controls.text/100} as CSSProperties}>{children}</div></Context.Provider>;
}
export function ControlsPanel(){
 const {controls,setControls}=useControls();
 return <section aria-label="Controls & readability"><h3 className={css.sectionTitle}>Controls & readability</h3><p className={css.small}>Choose what feels comfortable. Your rewards stay the same.</p><div className={css.gridTwo}>
  <label>Preparing and washing<select className={css.button} value={controls.work} onChange={e=>setControls({work:e.target.value as Preferences['work']})}><option value="hold">Hold to work</option><option value="toggle">Tap to start and stop</option></select></label>
  <label>Action controls<select className={css.button} value={controls.hand} onChange={e=>setControls({hand:e.target.value as Preferences['hand']})}><option value="right">Right-handed</option><option value="left">Left-handed</option></select></label>
  <label>Text size<select className={css.button} value={controls.text} onChange={e=>setControls({text:Number(e.target.value) as Preferences['text']})}>{[100,125,150].map(n=><option key={n} value={n}>{n}%</option>)}</select></label>
  <label className={css.button}><input type="checkbox" checked={controls.large} onChange={e=>setControls({large:e.target.checked})}/> Larger touch controls</label>
 </div></section>;
}
