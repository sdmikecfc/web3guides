import { DinerIcon } from './DinerIcon';
import type { DinerSceneData, DinerSceneProps, SceneAnchor } from './scene-types';
import css from './diner.module.css';

/** Labels follow real world positions and never intercept the cooking/cleaning surface. */
export function WorldCues({scene,anchors,reward,rewardAnchor}:{scene:DinerSceneData;anchors:SceneAnchor[];reward:DinerSceneProps['worldReward'];rewardAnchor?:SceneAnchor}){
  const active=scene.objects.some(object=>object.id===scene.selectedId&&(object.kind==='parcel'||object.kind==='spill'));
  return <div className={css.worldCues} aria-live="off">
    {anchors.filter(anchor=>anchor.visible).map(anchor=>{
      const object=scene.objects.find(item=>item.id===anchor.id);if(!object)return null;
      const selected=scene.selectedId===object.id,parcel=object.kind==='parcel',progress=object.progress??0;
      if(active&&!selected)return null;
      const label=parcel?(selected?(object.state==='working'?'Opening…':progress<1/3?'Peel the gold tape':progress<2/3?'Open the left flap':'Open the right flap'):object.id==='home-parcel'?'Fresh ingredients':'A delivery!'):(selected?'Wipe back and forth':'A little spill');
      return <div key={anchor.id} className={`${css.worldCue} ${selected?css.worldCueSelected:''}`} style={{left:anchor.x,top:anchor.y}} data-world-cue={anchor.id}>
        <span className={css.worldCueIcon}><DinerIcon name={parcel?'gift':'hand'} size={17}/></span><span>{label}</span>
        {selected&&progress>0&&<i className={css.worldCueProgress} style={{width:`${Math.max(2,progress*100)}%`}}/>}
      </div>;
    })}
    {reward&&rewardAnchor?.visible&&<div key={reward.receipt} role="status" className={css.worldReward} style={{left:rewardAnchor.x,top:rewardAnchor.y}}><DinerIcon name="star" size={22}/><strong>{reward.label}</strong><i/><i/><i/></div>}
  </div>;
}
