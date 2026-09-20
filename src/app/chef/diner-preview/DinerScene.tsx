"use client";
import { useEffect, useRef, useState } from 'react';
import type { DinerSceneProps, SceneAnchor } from './scene-types';
import type { DinerSceneController } from './scene3d';
import { EQUIPMENT_BY_ID } from '@/lib/chef/diner/content';
import { WorldCues } from './WorldCues';

export default function DinerScene(props:DinerSceneProps){
  const host=useRef<HTMLDivElement>(null),controller=useRef<DinerSceneController|null>(null),latest=useRef(props);
  latest.current=props;
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [anchors,setAnchors]=useState<SceneAnchor[]>([]),anchorHistory=useRef(new Map<string,SceneAnchor>());
  useEffect(()=>{
    let cancelled=false;setStatus('loading');
    import('./scene3d').then(({createDinerScene})=>{
      if(cancelled||!host.current)return;
      const api=createDinerScene(host.current,latest.current.mode,latest.current.scene,{
        onTarget:(id,seat)=>latest.current.onTarget(id,seat),onTile:(x,y)=>latest.current.onTile(x,y),
        onHoverTile:(x,y)=>latest.current.onHoverTile?.(x,y),
        onHomeGesture:gesture=>latest.current.onHomeGesture?.(gesture),
        onAnchors:values=>{for(const value of values)anchorHistory.current.set(value.id,value);if(anchorHistory.current.size>40)for(const id of anchorHistory.current.keys())if(!values.some(value=>value.id===id)&&id!==latest.current.worldReward?.id)anchorHistory.current.delete(id);setAnchors(values);latest.current.onAnchors?.(values);},
        onPerformance:value=>latest.current.onPerformance?.(value),
        onError:message=>{if(!cancelled){setError(message);setStatus('error');latest.current.onError?.(message);}},
      });
      controller.current=api;api.setRotation(latest.current.rotation);api.setEditing(!!latest.current.editing);setStatus('ready');
    }).catch(reason=>{if(!cancelled){const message=reason instanceof Error?reason.message:'The 3D canvas could not start.';setError(message);setStatus('error');latest.current.onError?.(message);}});
    return()=>{cancelled=true;controller.current?.dispose();controller.current=null;};
  },[props.mode,retry]);
  useEffect(()=>controller.current?.setScene(props.scene),[props.scene]);
  useEffect(()=>controller.current?.setRotation(props.rotation),[props.rotation]);
  useEffect(()=>controller.current?.setEditing(!!props.editing),[props.editing]);
  const button:React.CSSProperties={width:44,height:44,border:'1px solid #ddd8c9',borderRadius:14,background:'#fffdf5',color:'#353f35',boxShadow:'0 3px 12px #353f3510',fontSize:23,cursor:'pointer'};
  return <div className={props.className} style={{position:'absolute',inset:0}} data-diner-renderer="three" data-render-status={status} data-selected-target={props.scene.selectedId??undefined}>
    <div ref={host} style={{position:'absolute',inset:0,touchAction:'none'}} role="img" aria-label={props.mode==='truck'?'Interactive three-dimensional food truck and outdoor dining area':'Interactive three-dimensional restaurant'} />
    {props.mode==='home'&&(props.scene.selectedId?.startsWith('incident:')||props.scene.selectedId==='home-parcel')&&<div style={{position:'absolute',width:1,height:1,overflow:'hidden',clipPath:'inset(50%)'}}>
      <p>On the scene, move across a spill to wipe it. With the canvas focused, arrow keys move the cloth; reverse direction to keep wiping. For a parcel, press Enter to peel the tape, then open each flap.</p>
      <div role="progressbar" aria-label="Upkeep progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((props.scene.objects.find(object=>object.id===props.scene.selectedId)?.progress??0)*100)}/>
    </div>}
    {status==='loading'&&<div role="status" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',background:'#f6f1e4',color:'#456d58'}}>Setting the tables…</div>}
    {status==='error'&&<div role="alert" style={{position:'absolute',inset:'25% 10%',padding:24,borderRadius:24,background:'#fffdf5',color:'#353f35',textAlign:'center'}}><strong>The 3D scene could not start.</strong><p>Your progress is safe. Reload the scene, or try a browser with WebGL enabled.</p><button style={{...button,width:'auto',padding:'0 18px',fontSize:16}} onClick={()=>setRetry(v=>v+1)}>Try again</button><details style={{marginTop:16,fontSize:12}}><summary>Technical details</summary>{error}</details></div>}
    {status==='ready'&&<>
      {props.mode==='home'&&!props.editing&&props.showWorldHints!==false&&<WorldCues scene={props.scene} anchors={anchors} reward={props.worldReward} rewardAnchor={props.worldReward?anchorHistory.current.get(props.worldReward.id):undefined}/>}
      <div aria-label="Camera" role="group" data-camera-tools style={{position:'absolute',right:12,top:'36%',display:'grid',gap:6}}>
        <button style={button} aria-label="Zoom in" title="Zoom in" onClick={()=>controller.current?.zoomBy(1.15)}>+</button>
        <button style={button} aria-label="Zoom out" title="Zoom out" onClick={()=>controller.current?.zoomBy(1/1.15)}>−</button>
        <button style={{...button,fontSize:19}} aria-label="Reset camera" title="Reset camera" onClick={()=>controller.current?.resetCamera()}>⌖</button>
      </div>
      <label style={{position:'absolute',left:12,top:'36%',width:1,height:1,overflow:'hidden',clipPath:'inset(50%)'}} onFocus={event=>{Object.assign(event.currentTarget.style,{width:'auto',height:'auto',overflow:'visible',clipPath:'none'});}} onBlur={event=>{Object.assign(event.currentTarget.style,{width:'1px',height:'1px',overflow:'hidden',clipPath:'inset(50%)'});}}>
        Choose a scene target
        <select aria-label="Choose a scene target" value="" onChange={event=>{const [id,seat]=event.target.value.split('|');if(id)props.onTarget(id,seat);}}>
          <option value="">Select station or seat</option>
          {props.scene.objects.map(object=><option key={object.id} value={object.id} data-target-id={object.id}>{object.id.startsWith('incident:')?(object.kind==='spill'?'Spill · wipe across it':'Delivery · peel tape and open flaps'):object.id==='home-parcel'?'Daily ingredient parcel':object.id==='home-binder'?'Cookbook':object.id==='home-till'?'Restaurant till':object.id==='home-collections'?'Collections':EQUIPMENT_BY_ID[object.kind]?.name??object.kind.replaceAll('_',' ')}</option>)}
          {props.mode==='home'&&props.scene.people.filter(person=>person.role!=='customer'||person.id.startsWith('regular:')).map(person=><option key={person.id} value={person.id}>{person.id.startsWith('regular:')?'Your regular':person.role==='chef'?'Chef':'Waiter'}</option>)}
          {props.scene.tables.flatMap(table=>table.seats.map((seat,i)=><option key={seat.id} value={`${table.id}|${seat.id}`} data-target-id={table.id} data-seat-id={seat.id}>{table.id.replaceAll('_',' ')} · seat {i+1} · {seat.status}{seat.item?.kind==='dirty'&&seat.status!=='dirty'?' · clear dirty dish':''}</option>))}
        </select>
      </label>
    </>}
  </div>;
}
