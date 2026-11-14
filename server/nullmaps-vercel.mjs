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

function normalize(query){
  return query.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/đ/g,'d').trim()
    .replace(/^\d+[a-z]?\s+/,'').replace(/^(?:duong|d\.)\s+/,'')
    .replace(/\bq\.?\s*(\d+)\b/g,'quan $1').replace(/\bp\.?\s*(\d+)\b/g,'phuong $1')
    .replace(/\btp\b\.?/g,'thanh pho').replace(/\btx\b\.?/g,'thi xa')
    .replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
}

export function searchNullmaps(db,query){
  const name=normalize(query);
  if(!name)return [];
  const match=name.split(' ').map(word=>`"${word}"*`).join(' ');
  const fieldList='f.id,f.osm_id,f.name,f.folded,f.lat,f.lon,f.extra,f.importance,f.category,f.housenumber,f.street,f.district,f.city,f.region';
  const exact=db.prepare(`SELECT ${fieldList} FROM features f WHERE f.folded=? ORDER BY f.importance DESC LIMIT 50`).all(name);
  const indexed=db.prepare(`SELECT ${fieldList},bm25(features_fts) AS score FROM features_fts JOIN features f ON f.id=features_fts.rowid WHERE features_fts MATCH ? ORDER BY score LIMIT 96`).all(match);
  const results=new Map(indexed.map(row=>[row.id,row]));
  for(const row of exact)results.set(row.id,row);
  return [...results.values()].sort((a,b)=>Number(b.folded===name)-Number(a.folded===name)
    ||Number(b.folded.startsWith(name))-Number(a.folded.startsWith(name))
    ||Number(b.category==='legacy_district')-Number(a.category==='legacy_district')
    ||b.importance-a.importance||(a.score??0)-(b.score??0))
    .filter(row=>row.name&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180)
    .slice(0,8).map(row=>{
      const address=row.osm_id?.startsWith('ov:')&&row.extra?[row.name,row.extra]
        :[row.name,[row.housenumber,row.street].filter(Boolean).join(' '),row.district,row.city,row.region];
      return {label:[...new Set(address.filter(Boolean))].join(', '),lat:row.lat,lng:row.lon};
    });
}

export function createVercelNullmaps({archiveUrl,geocoderUrl,fetchImpl=fetch}){
  const archive=datasetUrl(archiveUrl,'.pmtiles');
  const database=datasetUrl(geocoderUrl,'.db');
  if(!archive)return;
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
    style:{...style,sources:{...style.sources,vn:{...style.sources.vn,url:`pmtiles://${archive}`,attribution:'© OpenStreetMap contributors · Overture Maps · Nullmaps'}}},
    searchAvailable:!!database,
    async geocode(query){
      opening??=openDatabase().catch(error=>{opening=undefined;throw error;});
      const db=new DatabaseSync(await opening,{readOnly:true});
      try{return searchNullmaps(db,query);}finally{db.close();}
    },
  };
}
