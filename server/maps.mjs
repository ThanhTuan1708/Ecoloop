// Nullmaps stays behind EcoLoop: shared API keys never enter browser bundles.
const assetPrefix='/api/maps/assets';
export function rewriteMapResource(value,upstream){
 const base=new URL(upstream);
 const rewrite=(reference)=>{
  const url=new URL(reference,base);
  if(url.origin!==base.origin&&!['martin:3000','demo','demo:80'].includes(url.host))throw new Error('External map resource is not allowed');
  if(!url.pathname.startsWith('/tiles/')&&!/^\/style(?:-dark|-terrain)?\.json$/.test(url.pathname))throw new Error('Unexpected map resource');
  url.searchParams.delete('key');
  return (assetPrefix+url.pathname+url.search).replace(/%7B/gi,'{').replace(/%7D/gi,'}');
 };
 function walk(v,key=''){
  if(typeof v==='string'&&['url','glyphs','sprite','data','tiles'].includes(key))return rewrite(v);
  if(Array.isArray(v))return v.map(x=>walk(x,key));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,k)]));
  return v;
 }
 return walk(value);
}
export function createMapsHandler({baseUrl=process.env.NULLMAPS_URL,apiKey=process.env.NULLMAPS_API_KEY||'',hosted=process.env.VERCEL==='1',fetchImpl=fetch}={}){
 const missingUpstream=hosted&&!baseUrl;
 baseUrl ||= 'http://127.0.0.1:8088';
 const base=new URL(baseUrl);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new Error('Invalid NULLMAPS_URL');
 const requests=new Map();
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/maps/'))return false;
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='GET'){json(405,{error:'Chỉ hỗ trợ GET.'});return true;}
  if(missingUpstream){json(503,{error:'Chưa cấu hình URL máy chủ Nullmaps trên Vercel.'});return true;}
  const address=req.socket.remoteAddress;const now=Date.now();for(const [k,v]of requests)if(v.until<now)requests.delete(k);
  const quota=requests.get(address)||{count:0,until:now+60000};requests.set(address,quota);if(++quota.count>1200){json(429,{error:'Quá nhiều yêu cầu bản đồ.'});return true;}
  if(url.pathname==='/api/maps/config'){json(200,{provider:'Nullmaps',styleUrl:assetPrefix+'/style.json',searchAvailable:!!apiKey});return true;}
  try{
   let path;let search='';let asset=false;
   if(url.pathname.startsWith(assetPrefix+'/')){
    path=decodeURIComponent(url.pathname.slice(assetPrefix.length));asset=true;
    if(path.includes('..')||path.includes('\\')||(!path.startsWith('/tiles/')&&path!=='/style.json')){json(400,{error:'Tài nguyên bản đồ không hợp lệ.'});return true;}
    const params=new URLSearchParams();for(const k of ['v'])if(url.searchParams.has(k))params.set(k,url.searchParams.get(k));search=params.toString();
   }else if(url.pathname==='/api/maps/geocode'){
    if(!apiKey){json(503,{error:'Chưa cấu hình API key Nullmaps trên server EcoLoop.'});return true;}
    const query=url.searchParams.get('q')?.trim();if(!query||query.length<3||query.length>200){json(400,{error:'Nhập địa điểm từ 3 đến 200 ký tự.'});return true;}
    path='/maps/api/geocode/json';search=new URLSearchParams({address:query}).toString();
   }else{json(404,{error:'Không có API bản đồ này.'});return true;}
   const target=new URL(path,base);target.search=search;
   const response=await fetchImpl(target,{headers:asset?{}:{'X-API-Key':apiKey},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok){json(502,{error:'Nullmaps chưa sẵn sàng hoặc chưa có dữ liệu bản đồ. Kiểm tra Docker và bộ dữ liệu Việt Nam.'});return true;}
   if(asset&&response.status===204){res.writeHead(204,{'Cache-Control':'private, max-age=300'});res.end();return true;}
   const length=Number(response.headers.get('content-length'));if(length>12*1024*1024)throw new Error('Too large');
   const chunks=[];let size=0;for await(const chunk of response.body||[]){size+=chunk.length;if(size>12*1024*1024)throw new Error('Too large');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
   if(!asset){
    const data=JSON.parse(bytes.toString());if(!['OK','ZERO_RESULTS'].includes(data.status))throw new Error('Geocoder not ready');
    const results=(data.results||[]).slice(0,8).map(r=>({label:r.formatted_address,lat:r.geometry?.location?.lat,lng:r.geometry?.location?.lng})).filter(r=>typeof r.label==='string'&&Number.isFinite(r.lat)&&Number.isFinite(r.lng)&&Math.abs(r.lat)<=90&&Math.abs(r.lng)<=180);
    json(200,{results});return true;
   }
   const type=response.headers.get('content-type')||'application/octet-stream';
   const isJson=path==='/style.json'||type.includes('json');
   const body=isJson?JSON.stringify(rewriteMapResource(JSON.parse(bytes.toString()),base)):bytes;
   res.writeHead(200,{'Content-Type':isJson?'application/json':type,'Cache-Control':'private, max-age=300'});
   res.end(body);
  }catch{if(!res.headersSent)json(503,{error:hosted?'Không kết nối được máy chủ Nullmaps từ Vercel.':'Không kết nối được Nullmaps local. Khởi động Docker và Nullmaps rồi thử lại.'});else res.end();}
  return true;
 };
}
