import { useMemo, useState } from 'react';
import Toolbar from './components/Toolbar';
import PortsEditor from './components/PortsEditor';
import MapCanvas from './components/MapCanvas';
import SearchableDropdown from './components/SearchableDropdown';
import { clamp01, computeAffine, fallbackCorners, applyAffine } from './lib/affine';
import { detectMapBoundsWithOpenCv } from './lib/mapBounds';
import { loadOpenCv } from './lib/opencvLoader';
import { downloadJson, parseWorldFile } from './lib/worldJson';

export default function App(){
const [world,setWorld]=useState<any>(null); const [zoneName,setZoneName]=useState(''); const [image,setImage]=useState<HTMLImageElement|null>(null); const [corners,setCorners]=useState<any>(null); const [affine,setAffine]=useState<any>(null); const [rows,setRows]=useState<any[]>([]); const [selecting,setSelecting]=useState<number|null>(null); const [status,setStatus]=useState('Open world.json and screenshot.');
const zones=world?.zones??[]; const zoneByName=useMemo(()=>Object.fromEntries(zones.map((z:any)=>[(z.name||z.id||''),z])),[zones]); const zone=zoneByName[zoneName];
const zoneOptions=useMemo(()=>Object.keys(zoneByName).sort().map(v=>({value:v,label:v})),[zoneByName]);
const zoneIdOptions=useMemo(()=>zones.map((z:any)=>z.id).filter(Boolean).sort().map((v:string)=>({value:v,label:v})),[zones]);
const syncZone=(nrows:any[])=>{if(!zone||!world)return; const ports:any={}; nrows.forEach((r)=>{if(!r.name)return; ports[r.name.toUpperCase().slice(0,5)]={x:+r.x.toFixed(4),y:+r.y.toFixed(4),connectsTo:{zoneId:r.zoneId||'',port:(r.port||'').toUpperCase()}};}); const nzones=world.zones.map((z:any)=>z===zone?{...z,ports}:z); setWorld({...world,zones:nzones});};
const onZone=(name:string)=>{setZoneName(name); const z=zoneByName[name]; const p=z?.ports??{}; setRows(Object.entries(p).map(([k,v]:any,i)=>({key:`${k}-${i}`,name:k,x:v.x??0,y:v.y??0,zoneId:v.connectsTo?.zoneId??'',port:v.connectsTo?.port??''})));};
return <div className='vh-100 d-flex flex-column'>
<Toolbar status={status} onWorld={async f=>{const w=await parseWorldFile(f); setWorld(w); const first=(w.zones?.map((z:any)=>z.name||z.id).filter(Boolean).sort()[0])||''; setStatus(`Loaded ${w.zones?.length??0} zones.`); if(first) onZone(first);}} onImage={async f=>{const url=URL.createObjectURL(f); const img=new Image(); img.onload=async()=>{setImage(img); try{const cv=await loadOpenCv(); const det=detectMapBoundsWithOpenCv(cv,img); setCorners(det.corners); setAffine(computeAffine(det.corners)); setStatus(`Detected bounds lines +${det.positiveLineCount}/-${det.negativeLineCount}`);}catch{const c=fallbackCorners(img.width,img.height); setCorners(c); setAffine(computeAffine(c)); setStatus('OpenCV detect failed; using fallback crop bounds.');}}; img.src=url;}} onExport={()=>world&&downloadJson('world.updated.json',world)} onUnwarp={()=>setStatus('Unwarped export can be added from current affine (optional).')}/>
<div className='flex-grow-1 d-flex overflow-hidden'>
<div className='border-end p-2' style={{width:620,overflow:'auto'}}><div className='mb-2'><label className='form-label small'>Zone</label><SearchableDropdown options={zoneOptions} value={zoneName} onChange={onZone} isDisabled={!world}/></div><PortsEditor rows={rows} selecting={selecting} zoneOptions={zoneIdOptions} portOptions={zone?Object.keys(zone.ports??{}):[]} onAdd={()=>{const nr=[...rows,{key:crypto.randomUUID(),name:'NE',x:0,y:0,zoneId:'',port:''}]; setRows(nr); syncZone(nr);}} onChange={(i:number,r:any)=>{const nr=rows.map((x,j)=>j===i?r:x); setRows(nr); syncZone(nr);} onRemove={(i:number)=>{const nr=rows.filter((_,j)=>j!==i); setRows(nr); syncZone(nr);} onToggle={(i:number)=>setSelecting(selecting===i?null:i)} /></div>
<div className='flex-grow-1'><MapCanvas image={image} corners={corners} ports={rows} project={(u,v)=>affine?applyAffine(affine.fwd,clamp01(u),clamp01(v)):null} onClick={(ix,iy)=>{if(selecting===null||!affine)return; const [u,v]=applyAffine(affine.inv,ix,iy); const nr=rows.map((r,i)=>i===selecting?{...r,x:clamp01(u),y:clamp01(v)}:r); setRows(nr); setSelecting(null); syncZone(nr);}}/></div>
</div></div>}
