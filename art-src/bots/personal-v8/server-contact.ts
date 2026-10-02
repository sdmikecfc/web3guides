import * as T from 'three';
import type {Practice8} from './v8-engine';

/** Connected fights use the original server collision contract: outer faces only.
 * Exported render materials are double-sided; paint and dent presentation must
 * never decide which contacts the authoritative simulation accepts. */
export function pinServerContact(engine:Practice8){
 const materials:T.Material[]=[];
 for(const actor of engine.actors)for(const proxy of actor.proxies)for(const surface of proxy.surfaces??[]){
  const clone=(source:T.Material)=>{const material=source.clone();material.side=T.FrontSide;materials.push(material);return material;};
  surface.collision.material=Array.isArray(surface.collision.material)?surface.collision.material.map(clone):clone(surface.collision.material);
 }
 return ()=>materials.forEach(material=>material.dispose());
}
