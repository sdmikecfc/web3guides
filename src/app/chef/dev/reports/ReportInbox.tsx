"use client";
import {useEffect,useState} from 'react';
import {ReportReplay} from '../../diner-preview/ProblemReport';
import type {ProblemReport} from '@/lib/chef/diner/problem-reports';
type Row={id:string;created_at:string;category:string;status:string;build:string;payload?:ProblemReport};
export function ReportInbox(){
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<Row|null>(null),[category,setCategory]=useState(''),[build,setBuild]=useState(''),[error,setError]=useState('');
 const path='/api/chef/diner/reports/inbox';
 async function request(url=path,method='GET',body?:unknown){const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!response.ok)throw new Error('The private inbox could not be reached.');return response.json();}
 async function load(){try{const data=await request(`${path}?category=${encodeURIComponent(category)}&build=${encodeURIComponent(build)}`);setRows(data.reports);setError('');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[category]);
 async function open(id:string){try{const data=await request(`${path}?id=${id}`);setSelected(data.reports[0]??null);}catch(e){setError((e as Error).message);}}
 async function update(status:string){if(!selected)return;try{await request(path,status==='delete'?'DELETE':'POST',{id:selected.id,status});setSelected(status==='delete'?null:{...selected,status});await load();}catch(e){setError((e as Error).message);}}
 return <main style={{maxWidth:1100,margin:'32px auto',padding:20,background:'#fff9ed',color:'#294b3b'}}><h1>Domain Kitchen reports</h1><p>Private gameplay diagnostics · retained for 30 days</p><label>Category <select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All</option><option value="interaction">Couldn’t interact</option><option value="understanding">Didn’t understand</option><option value="difficulty">Too difficult</option></select></label><label> Build <input value={build} onChange={e=>setBuild(e.target.value)}/></label><button onClick={()=>void load()}>Filter</button>{error&&<p role="alert">{error}</p>}<div style={{display:'flex',gap:24,flexWrap:'wrap'}}><ul>{rows.map(row=><li key={row.id}><button onClick={()=>void open(row.id)}>{row.category} · {row.status} · {new Date(row.created_at).toLocaleString()} · {row.build}</button></li>)}</ul>{selected?.payload&&<section style={{flex:'1 1 500px'}}><h2>{selected.payload.category}</h2><p>{selected.payload.note}</p><label>Status <select value={selected.status} onChange={e=>void update(e.target.value)}><option value="new">New</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select></label><ReportReplay report={selected.payload}/><button onClick={()=>{if(window.confirm('Permanently delete this report?'))void update('delete');}}>Delete report</button></section>}</div></main>;
}
