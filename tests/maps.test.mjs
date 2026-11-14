import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createMapsHandler,rewriteMapResource} from '../server/maps.mjs';

async function call(handler,path,method='GET'){
 let status,headers,body;
 const res={headersSent:false,writeHead(s,h){status=s;headers=h;this.headersSent=true;},end(b){body=Buffer.isBuffer(b)?b.toString():b;}};
 await handler({method,socket:{remoteAddress:'local'}},res,new URL(path,'http://localhost'));
 return {status,headers,body,json:()=>JSON.parse(body)};
}
test('Nullmaps rewrites style and TileJSON to same-origin, preserving placeholders and rejecting external resources',()=>{
 const style=rewriteMapResource({glyphs:'/tiles/font/{fontstack}/{range}',sprite:'/tiles/sprite/sprites',sources:{vn:{url:'/tiles/vietnam?v=z16'}},tiles:['http://martin:3000/tiles/vietnam/{z}/{x}/{y}?key=secret']},'http://127.0.0.1:8088');
 assert.equal(style.glyphs,'/api/maps/assets/tiles/font/{fontstack}/{range}');
 assert.equal(style.tiles[0],'/api/maps/assets/tiles/vietnam/{z}/{x}/{y}');
 assert.throws(()=>rewriteMapResource({sources:{x:{url:'https://unapproved.example/tiles/vietnam'}}},'http://localhost:8088'));
 assert.deepEqual(rewriteMapResource({tiles:['http://maps.example/tiles/vietnam/{z}/{x}/{y}']},'https://maps.example').tiles,['/api/maps/assets/tiles/vietnam/{z}/{x}/{y}']);
});
test('Nullmaps keeps shared API key server-only and normalizes valid geocoder results',async()=>{
 const seen=[];const handler=createMapsHandler({apiKey:'test-only-secret',fetchImpl:async(url,opts)=>{seen.push({url:String(url),opts});return Response.json({status:'OK',results:[{formatted_address:'Bến Thành',geometry:{location:{lat:10.77,lng:106.69}}},{formatted_address:'Invalid',geometry:{location:{lat:999,lng:0}}}]});}});
 const config=await call(handler,'/api/maps/config');assert.equal(config.json().searchAvailable,true);assert.ok(!config.body.includes('secret'));
 const result=await call(handler,'/api/maps/geocode?q=Ben%20Thanh');assert.equal(result.status,200);assert.deepEqual(result.json().results,[{label:'Bến Thành',lat:10.77,lng:106.69}]);
 assert.equal(seen[0].opts.headers['X-API-Key'],'test-only-secret');assert.ok(!seen[0].url.includes('secret'));assert.equal(seen[0].opts.redirect,'error');assert.ok(!result.body.includes('secret'));
});
test('Nullmaps fails clearly without service/key; does not fetch arbitrary assets or expose upstream errors',async()=>{
 let calls=0;const handler=createMapsHandler({apiKey:'',fetchImpl:async()=>{calls++;throw Error('secret diagnostic');}});
 assert.equal((await call(handler,'/api/maps/geocode?q=Hanoi')).status,503);assert.equal(calls,0);
 assert.equal((await call(handler,'/api/maps/assets/not-allowed')).status,400);assert.equal(calls,0);
 assert.equal((await call(handler,'/api/maps/assets/tiles/%2e%2e%2fprivate')).status,400);
 const offline=await call(handler,'/api/maps/assets/style.json');assert.equal(offline.status,503);assert.ok(!offline.body.includes('secret diagnostic'));
 assert.equal((await call(handler,'/api/maps/geocode?q=x','POST')).status,405);
});
test('Nullmaps proxies binary tiles without altering bytes and rejects external JSON resources before sending success',async()=>{
 const handler=createMapsHandler({fetchImpl:async(url)=>String(url).endsWith('/0/0/0')?new Response(null,{status:204}):new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'application/x-protobuf'}})});
 const tile=await call(handler,'/api/maps/assets/tiles/vietnam/1/2/3');assert.equal(tile.status,200);assert.equal(tile.body,String.fromCharCode(1,2,3));
 const empty=await call(handler,'/api/maps/assets/tiles/vietnam/0/0/0');assert.equal(empty.status,204);
 const bad=createMapsHandler({fetchImpl:async()=>Response.json({glyphs:'https://not-allowed.example/tiles/font'})});
 assert.equal((await call(bad,'/api/maps/assets/style.json')).status,503);
});

test('Vercel Nullmaps serves the Blob-backed style and searches the SQLite dataset once per instance',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ecoloop-nullmaps-test-'));
 const databasePath=join(dir,'test.db');
 const origin='https://example.public.blob.vercel-storage.com';
 const archiveUrl=`${origin}/vietnam.pmtiles`;
 const geocoderUrl=`${origin}/${randomUUID()}.db`;
 const cache=join(tmpdir(),`nullmaps-${createHash('sha256').update(geocoderUrl).digest('hex')}.db`);
 try{
  const db=new DatabaseSync(databasePath);
  try{db.exec(`CREATE TABLE features(id INTEGER PRIMARY KEY,osm_id,name,folded,lat,lon,extra,importance,category,housenumber,street,district,city,region);
   CREATE VIRTUAL TABLE features_fts USING fts5(folded);
   INSERT INTO features VALUES(1,'n1','Bến Thành','ben thanh',10.77,106.69,NULL,100,NULL,NULL,NULL,NULL,'Hồ Chí Minh',NULL);
   INSERT INTO features VALUES(2,'n2','Nguyễn Văn Bảo','nguyen van bao',10.82,106.68,NULL,100,NULL,NULL,NULL,'Gò Vấp','Hồ Chí Minh',NULL);
   INSERT INTO features VALUES(3,'n3','14 Nguyễn Văn Bảo','14 nguyen van bao',10.821,106.681,NULL,100,NULL,'14','Nguyễn Văn Bảo','Gò Vấp','Hồ Chí Minh',NULL);
   INSERT INTO features_fts(rowid,folded) SELECT id,folded FROM features;`);}finally{db.close();}
  const data=await readFile(databasePath);
  let downloads=0;
  const handler=createMapsHandler({hosted:true,archiveUrl,geocoderUrl,fetchImpl:async url=>{
   assert.equal(url,geocoderUrl);
   downloads++;
   return new Response(data);
  }});
  assert.equal((await call(handler,'/api/maps/config')).json().searchAvailable,true);
  const style=(await call(handler,'/api/maps/assets/style.json')).json();
  assert.equal(style.sources.vn.url,`pmtiles://${archiveUrl}`);
  const search=await Promise.all(['Bến Thành','Ben Tha'].map(query=>call(handler,`/api/maps/geocode?q=${encodeURIComponent(query)}`)));
  for(const result of search){
   assert.equal(result.status,200);
   assert.deepEqual(result.json().results,[{label:'Bến Thành, Hồ Chí Minh',lat:10.77,lng:106.69}]);
  }
  const lookup=async query=>(await call(handler,`/api/maps/geocode?q=${encodeURIComponent(query)}`)).json().results;
  assert.deepEqual(await lookup('14 Nguyễn Văn Bảo, Gò Vấp'),[{label:'14 Nguyễn Văn Bảo, Gò Vấp, Hồ Chí Minh',lat:10.821,lng:106.681}]);
  assert.deepEqual(await lookup('12 Nguyễn Văn Bảo'),[{label:'Nguyễn Văn Bảo',address:'12 Nguyễn Văn Bảo',approximate:true,lat:10.82,lng:106.68}]);
  assert.equal(downloads,1);
 }finally{
  await rm(dir,{recursive:true,force:true});
  await rm(cache,{force:true});
 }
});
