import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { Image as ImageIcon } from 'lucide-react';
import { viewEvidence } from './evidence';
export default function EvidenceImage({account,hash,busy,run}:{account?:Address;hash:string;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<void>}){
  const [url,setUrl]=useState('');
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
  return <div className="evidence-image">{url?<img src={url} alt="Ảnh minh chứng vật liệu do người tái chế gửi"/>:<button type="button" className="secondary full-width" disabled={busy||!account} onClick={()=>run(async()=>{if(account)setUrl(await viewEvidence(account,hash));})}><ImageIcon size={16}/>Ký xác thực để xem ảnh minh chứng</button>}<p className="footnote">Chỉ chủ ảnh hoặc ví có quyền thu gom được xem ảnh.</p></div>;
}
