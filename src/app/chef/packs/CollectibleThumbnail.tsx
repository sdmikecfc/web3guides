'use client';
import {useEffect,useRef,useState} from 'react';
import css from './pack-experience.module.css';

export default function CollectibleThumbnail({id}:{id:string}) {
 const host=useRef<HTMLSpanElement>(null),[url,setUrl]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let cancelled=false;setUrl('');setFailed(false);
  const observer=new IntersectionObserver(entries=>{
   if(!entries.some(entry=>entry.isIntersecting))return;
   observer.disconnect();
   void import('./collectible-thumbnails').then(module=>module.collectibleThumbnail(id)).then(value=>{if(!cancelled)setUrl(value);}).catch(()=>{if(!cancelled)setFailed(true);});
  },{rootMargin:'300px'});
  if(host.current)observer.observe(host.current);
  return()=>{cancelled=true;observer.disconnect();};
 },[id]);
 return <span ref={host} className={css.thumbnail} data-thumbnail-status={failed?'error':url?'ready':'loading'}>
  {url?<img src={url} alt="" width={512} height={512}/>:<span className={css.thumbnailPlaceholder}>{failed?'Open to view artwork':'Preparing artwork…'}</span>}
 </span>;
}
