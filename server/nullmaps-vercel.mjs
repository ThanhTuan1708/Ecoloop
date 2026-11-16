import {createWriteStream} from 'node:fs';
import {rename,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import style from './nullmaps-style.json' with {type:'json'};

function datasetUrl(value,extension){
  if(!value)return;
  const url=new URL(value);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.public.blob.vercel-storage.com')||url.username||url.password||url.search||url.hash||!url.pathname.endsWith(extension)){
    throw new Error(`Invalid Nullmaps ${extension} Blob URL`);
  }
  return url.href;
}

const housePrefix=/^(\d+[a-z]?(?:\s*[/-]\s*\d+[a-z]?)*)(?:\s+|,\s*)(?=\p{L})/iu;

function normalize(query){
  return query.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/đ/g,'d').trim()
    .replace(/^(?:duong|d\.)\s+/,'')
    .replace(/\bq\.?\s*(\d+)\b/g,'quan $1').replace(/\bp\.?\s*(\d+)\b/g,'phuong $1')
    .replace(/\btp\b\.?/g,'thanh pho').replace(/\btx\b\.?/g,'thi xa')
    .replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
}

export function searchNullmaps(db,query){
  const input=query.trim();
  const house=input.match(housePrefix);
  const number=house?.[1].toLowerCase().replace(/\s/g,'');
  const streetQuery=house?input.slice(house[0].length):input;
  const name=normalize(streetQuery);
  if(!name)return [];
  const streetName=normalize(streetQuery.split(',')[0]);
  const area=normalize(streetQuery.split(',').slice(1).join(' '));
  const match=name.split(' ').map(word=>`"${word}"*`).join(' ');
  const fieldList='f.id,f.osm_id,f.name,f.folded,f.lat,f.lon,f.extra,f.importance,f.category,f.housenumber,f.street,f.district,f.city,f.region';
  const exact=db.prepare(`SELECT ${fieldList} FROM features f WHERE f.folded IN (?,?) ORDER BY f.importance DESC LIMIT 50`).all(name,streetName);
  const indexed=db.prepare(`SELECT ${fieldList},bm25(features_fts) AS score FROM features_fts JOIN features f ON f.id=features_fts.rowid WHERE features_fts MATCH ? ORDER BY score LIMIT 96`).all(match);
  const results=new Map(indexed.map(row=>[row.id,row]));
  for(const row of exact)results.set(row.id,row);
  const matchingHouse=new Set();
  if(number){
    const areaWords=area.split(' ').filter(Boolean);
    const candidates=db.prepare(`SELECT ${fieldList} FROM features f WHERE lower(replace(f.housenumber,' ',''))=?`).all(number);
    for(const row of candidates){
      if(normalize(row.street||'')!==streetName&&normalize(row.name?.replace(housePrefix,'')||'')!==streetName)continue;
      const rowArea=normalize([row.district,row.city,row.region,row.extra].filter(Boolean).join(' ')).split(' ');
      if(!areaWords.every(word=>rowArea.includes(word)))continue;
      matchingHouse.add(row.id);
      results.set(row.id,row);
    }
  }
  const ordered=[...results.values()].sort((a,b)=>Number(matchingHouse.has(b.id))-Number(matchingHouse.has(a.id))
    ||Number(b.folded===name)-Number(a.folded===name)
    ||Number(b.folded===streetName)-Number(a.folded===streetName)
    ||Number(b.folded.startsWith(name))-Number(a.folded.startsWith(name))
    ||Number(b.category==='legacy_district')-Number(a.category==='legacy_district')
    ||b.importance-a.importance||(a.score??0)-(b.score??0))
    .filter(row=>row.name&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180);
  const numbered=ordered.filter(row=>matchingHouse.has(row.id));
  const streets=ordered.filter(row=>row.folded===streetName&&!row.housenumber);
  const selected=number?(numbered.length?numbered:streets):ordered;
  return selected.slice(0,8).map(row=>{
      if(number&&!matchingHouse.has(row.id))return {label:row.name,lat:row.lat,lng:row.lon,approximate:true,address:input};
      const address=row.osm_id?.startsWith('ov:')&&row.extra?[row.name,row.extra]
        :[matchingHouse.has(row.id)?[row.housenumber,row.street||row.name.replace(housePrefix,'')].filter(Boolean).join(' '):row.name,
          matchingHouse.has(row.id)?undefined:[row.housenumber,row.street].filter(Boolean).join(' '),row.district,row.city,row.region];
      return {label:[...new Set(address.filter(Boolean))].join(', '),lat:row.lat,lng:row.lon};
    });
}

export function createVercelNullmaps({archiveUrl,geocoderUrl,fetchImpl=fetch}){
  const archive=datasetUrl(archiveUrl,'.pmtiles');
  const database=datasetUrl(geocoderUrl,'.db');
  if(!archive)return;
  let archiveCheck;
  let archiveCheckUntil=0;
  function archiveAvailable(){
    if(archiveCheck&&Date.now()<archiveCheckUntil)return archiveCheck;
    archiveCheckUntil=Date.now()+30_000;
    archiveCheck=(async()=>{
      try{
        const response=await fetchImpl(archive,{headers:{Range:'bytes=0-126'},redirect:'error',signal:AbortSignal.timeout(5000)});
        const available=response.status===206&&/^bytes 0-126\/\d+$/.test(response.headers.get('content-range')||'');
        await response.body?.cancel();
        return available;
      }catch{return false;}
    })();
    return archiveCheck;
  }
  let opening;
  async function openDatabase(){
    const name=createHash('sha256').update(database).digest('hex');
    const file=join(tmpdir(),`nullmaps-${name}.db`);
    if(!await stat(file).catch(error=>{if(error.code!=='ENOENT')throw error;})){
      const temp=`${file}.${randomUUID()}.tmp`;
      try{
        const response=await fetchImpl(database,{redirect:'error',signal:AbortSignal.timeout(45000)});
        if(!response.ok||!response.body)throw new Error('Nullmaps database unavailable');
        let bytes=0;
        const limit=new Transform({transform(chunk,encoding,callback){
          bytes+=chunk.length;
          if(bytes>256*1024*1024)return callback(new Error('Nullmaps database exceeds scratch space budget'));
          callback(null,chunk);
        }});
        await pipeline(response.body,limit,createWriteStream(temp,{flags:'wx'}));
        const check=new DatabaseSync(temp,{readOnly:true});
        try{check.prepare('SELECT id FROM features LIMIT 1').get();}finally{check.close();}
        await rename(temp,file);
      }finally{await rm(temp,{force:true});}
    }
    return file;
  }
  return {
    archiveAvailable,
    style:{...style,sources:{...style.sources,vn:{...style.sources.vn,url:`pmtiles://${archive}`,attribution:'© OpenStreetMap contributors · Overture Maps · Nullmaps'}}},
    searchAvailable:!!database,
    async geocode(query){
      opening??=openDatabase().catch(error=>{opening=undefined;throw error;});
      const db=new DatabaseSync(await opening,{readOnly:true});
      try{return searchNullmaps(db,query);}finally{db.close();}
    },
  };
}
