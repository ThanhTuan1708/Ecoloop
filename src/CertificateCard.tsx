import {useEffect,useState} from 'react';
import {Award,ExternalLink} from 'lucide-react';
import type {Address} from 'viem';
import {tr} from './settings';
import {readCertificate,certificateUrl,type CertificateView} from './pickupClient';
import {IcmBridgePanel} from './IcmBridgePanel';

/** On-chain SVG recycling certificate (ECOREC NFT) with its Avalanche ICM status. */
export function CertificateCard({certificate,lotId,compact,account,canSend}:{certificate:Address;lotId:number;compact?:boolean;account?:Address;canSend?:boolean}){
  const [cert,setCert]=useState<CertificateView|null>();
  useEffect(()=>{let live=true;setCert(undefined);readCertificate(certificate,lotId).then(c=>{if(live)setCert(c||null);});return()=>{live=false;};},[certificate,lotId]);
  if(cert===undefined)return <p role="status" className="footnote">{tr('Đang tải chứng nhận NFT…')}</p>;
  if(!cert)return null;
  return <div className={compact?'cert-card compact':'cert-card'}><img src={cert.image} alt={cert.name}/><div><strong><Award size={15}/>{tr('Chứng nhận tái chế NFT #{id}',{id:lotId})}</strong>{!compact&&<p>{tr('Lưu vĩnh viễn trên Avalanche: ai cũng kiểm chứng được số kg đã tái chế, ví dụ doanh nghiệp cần báo cáo trách nhiệm tái chế.')}</p>}<a className="text-link" href={certificateUrl(certificate,lotId)} target="_blank" rel="noreferrer">{tr('Xem trên Snowtrace')}<ExternalLink size={12}/></a><IcmBridgePanel certificate={certificate} lotId={lotId} account={account} canSend={canSend}/></div></div>;
}
