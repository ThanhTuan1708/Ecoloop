import {useEffect,useRef,useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import type {Map as LibreMap,Marker} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {Protocol} from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {Lot} from './pickupClient';
import {tr,wt} from './settings';
const protocol=new Protocol();maplibregl.addProtocol('pmtiles',protocol.tile);maplibregl.setWorkerUrl(workerUrl);
const toAbsoluteUrl=(u:string)=>u.startsWith('/')?window.location.origin+u:u;
function resolveStyleUrls(value:unknown,key=''):unknown{
 if(typeof value==='string'&&['url','glyphs','sprite','data','tiles'].includes(key))return toAbsoluteUrl(value);
 if(Array.isArray(value))return value.map(x=>resolveStyleUrls(x,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,x])=>[k,resolveStyleUrls(x,k)]));
 return value;
}
type Place={label:string;lat:number;lng:number};
export default function PickupMap({lots,center,onSelect,onPin}:{lots:Lot[];center?:[number,number];onSelect?:(id:number)=>void;onPin?:(point:[number,number])=>void}){
 const root=useRef<HTMLDivElement>(null);const map=useRef<LibreMap|undefined>(undefined);const markers=useRef<Marker[]>([]);const pin=useRef(onPin);pin.current=onPin;const select=useRef(onSelect);select.current=onSelect;
 const [version,setVersion]=useState(0);const [ready,setReady]=useState(false);const [error,setError]=useState('');const [searchEnabled,setSearchEnabled]=useState(false);const [query,setQuery]=useState('');const [places,setPlaces]=useState<Place[]>([]);const [searchError,setSearchError]=useState('');const [searching,setSearching]=useState(false);const request=useRef<AbortController|undefined>(undefined);
 useEffect(()=>{
  if(!root.current)return;const controller=new AbortController();let disposed=false;let m:LibreMap|undefined;let resize:ResizeObserver|undefined;setReady(false);setError('');
  void(async()=>{try{
   const configResponse=await fetch('/api/maps/config',{signal:controller.signal});if(!configResponse.ok)throw new Error(tr('Chưa tải được cấu hình Nullmaps. Khởi động lại server EcoLoop.'));const config=await configResponse.json();if(disposed)return;setSearchEnabled(!!config.searchAvailable);
   const response=await fetch(config.styleUrl,{signal:controller.signal});if(!response.ok){const detail=await response.json();throw new Error(detail.error||tr('Nullmaps chưa sẵn sàng.'));}const style=resolveStyleUrls(await response.json()) as maplibregl.StyleSpecification;if(disposed||!root.current)return;
   m=new maplibregl.Map({container:root.current,style,transformRequest:url=>({url:toAbsoluteUrl(url)}),center:center?[center[1],center[0]]:[106.7,10.776],zoom:center?13:11,attributionControl:{compact:true,customAttribution:'Map data © OpenStreetMap contributors · Overture Maps · Nullmaps'}});map.current=m;
   m.addControl(new maplibregl.NavigationControl(),'top-right');m.addControl(new maplibregl.ScaleControl({unit:'metric'}));
   m.on('load',()=>{if(!disposed){setReady(true);setError('');}});m.on('error',()=>{if(!disposed)setError(tr('Một số lớp bản đồ chưa tải được. Kiểm tra dữ liệu tiles, font và sprite của Nullmaps.'));});
   m.on('click',e=>pin.current?.([e.lngLat.lat,e.lngLat.lng]));resize=new ResizeObserver(()=>m?.resize());resize.observe(root.current);
  }catch(e){if(!disposed)setError(e instanceof Error?e.message:tr('Không mở được bản đồ Nullmaps.'));}})();
  return()=>{disposed=true;controller.abort();resize?.disconnect();markers.current.forEach(x=>x.remove());markers.current=[];m?.remove();map.current=undefined;};
 },[version]);
 useEffect(()=>{const m=map.current;if(!m||!ready)return;if(center)m.flyTo({center:[center[1],center[0]],zoom:Math.max(13,m.getZoom()),duration:400});},[center?.[0],center?.[1],ready]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;markers.current.forEach(x=>x.remove());markers.current=[];
  lots.forEach(l=>{const el=document.createElement('button');el.type='button';el.className='nullmaps-lot-pin';el.textContent='#'+l.id;el.title=tr('Lô #{id} · {kg}',{id:l.id,kg:wt(l.estimated.reduce((a,b)=>a+b,0)/1000)});el.setAttribute('aria-label',el.title);el.addEventListener('click',e=>{e.stopPropagation();select.current?.(l.id);});markers.current.push(new maplibregl.Marker({element:el}).setLngLat([l.longitude,l.latitude]).addTo(m));});
  if(center)markers.current.push(new maplibregl.Marker({color:'#2675dd'}).setLngLat([center[1],center[0]]).addTo(m));
  if(!center&&lots.length){const bounds=new maplibregl.LngLatBounds();lots.forEach(l=>bounds.extend([l.longitude,l.latitude]));m.fitBounds(bounds,{padding:50,maxZoom:13,duration:0});}
 },[lots,center,ready]);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function search(){request.current?.abort();const controller=new AbortController();request.current=controller;setSearching(true);setSearchError('');setPlaces([]);try{const response=await fetch('/api/maps/geocode?q='+encodeURIComponent(query.trim()),{signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||tr('Không tìm được địa điểm.'));if(controller.signal.aborted)return;setPlaces(result.results);if(!result.results.length)setSearchError(tr('Không tìm thấy địa điểm. Thử tên đường hoặc khu vực khác.'));}catch(e){if(!controller.signal.aborted)setSearchError(e instanceof Error?e.message:tr('Không tìm được địa điểm.'));}finally{if(!controller.signal.aborted)setSearching(false);}}
 return <div className="nullmaps-container"><div className="nullmaps-search"><input aria-label={tr("Tìm địa điểm với Nullmaps")} placeholder={tr("Tìm tên đường, phường hoặc địa điểm…")} value={query} maxLength={200} onChange={e=>{request.current?.abort();setSearching(false);setPlaces([]);setQuery(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(searchEnabled&&query.trim().length>=3)void search();}}}/><button type="button" className="secondary" disabled={!searchEnabled||searching||query.trim().length<3} onClick={()=>void search()}>{searching?tr('Đang tìm…'):tr('Tìm địa điểm')}</button></div>{!searchEnabled&&<p className="footnote">{tr('Tìm địa điểm cần geocoder và API key Nullmaps trên server. Nền bản đồ không cần API key.')}</p>}<p className="footnote">{tr('Từ khóa tìm kiếm được gửi tới máy chủ Nullmaps bạn cấu hình. Khoảng cách lô vẫn là đường chim bay, theo tọa độ công khai đã làm tròn.')}</p>{searchError&&<p role="status">{tr(searchError)}</p>}{places.length>0&&<ul className="nullmaps-results">{places.map((place,i)=><li key={i}><button type="button" onClick={()=>{map.current?.flyTo({center:[place.lng,place.lat],zoom:15});pin.current?.([place.lat,place.lng]);setPlaces([]);}}>{place.label}</button></li>)}</ul>}<div className="pickup-map" ref={root} role="region" aria-label={onPin?tr('Nullmaps: chọn khu vực thu gom'):tr('Nullmaps: các lô thu gom')}/>{!ready&&!error&&<p role="status">{tr('Đang kết nối Nullmaps local…')}</p>}{error&&<div className="web-warning" role="status">{tr(error)}<button type="button" className="secondary" onClick={()=>setVersion(n=>n+1)}>{tr('Thử kết nối bản đồ lại')}</button><p>{tr('Bạn vẫn có thể dùng danh sách hoặc nhập tọa độ khi đăng lô.')}</p></div>}</div>;
}
