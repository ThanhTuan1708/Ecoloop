const style={
  version:8,
  sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,
    attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}},
  layers:[{id:'osm',type:'raster',source:'osm'}],
};

export function createOpenStreetMapHandler({fetchImpl=fetch,searchUrl=process.env.PHOTON_URL||'https://photon.komoot.io/api/'}={}){
  const cache=new Map();
  let nextSearch=0;
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/maps/'))return false;
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(req.method!=='GET'){send(405,{error:'Chỉ hỗ trợ GET.'});return true;}
    if(url.pathname==='/api/maps/config'){
      send(200,{provider:'OpenStreetMap',styleUrl:'/api/maps/assets/style.json',searchAvailable:true});return true;
    }
    if(url.pathname==='/api/maps/assets/style.json'){send(200,style);return true;}
    if(url.pathname!=='/api/maps/geocode'){send(404,{error:'Không có API bản đồ này.'});return true;}
    const query=url.searchParams.get('q')?.trim();
    if(!query||query.length<3||query.length>200){send(400,{error:'Nhập địa điểm từ 3 đến 200 ký tự.'});return true;}
    const now=Date.now();
    const key=query.toLocaleLowerCase('vi');
    const previous=cache.get(key);
    if(previous&&previous.expires>now){send(200,{results:previous.results});return true;}
    if(now<nextSearch){send(429,{error:'Vui lòng chờ một giây rồi tìm lại.'});return true;}
    nextSearch=now+1000;
    try{
      const target=new URL(searchUrl);
      target.search=new URLSearchParams({q:query,limit:'8',lat:'10.776',lon:'106.7',bbox:'102,8,110,24'}).toString();
      const response=await fetchImpl(target,{headers:{'User-Agent':'EcoLoop/1.0 (+https://ecoloop-pi-six.vercel.app)'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Geocoder unavailable');
      const data=await response.json();
      const results=(data.features||[]).slice(0,8).map(feature=>{
        const p=feature.properties||{};
        const [lng,lat]=feature.geometry?.coordinates||[];
        const label=[...new Set([p.name,[p.housenumber,p.street].filter(Boolean).join(' '),p.district,p.city,p.state,p.country].filter(Boolean))].join(', ');
        return {label,lat,lng,approximate:!p.housenumber};
      }).filter(p=>p.label&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180);
      if(cache.size>=200)cache.delete(cache.keys().next().value);
      cache.set(key,{results,expires:now+3600000});
      send(200,{results});
    }catch{send(503,{error:'Chưa tìm được địa điểm. Hãy thử lại hoặc chọn vị trí trên bản đồ.'});}
    return true;
  };
}
