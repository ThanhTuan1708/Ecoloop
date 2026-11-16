import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {MessageCircle,Send} from 'lucide-react';
import type {Address} from 'viem';
import {authorize} from './evidence';
import {api,digest} from './pickupClient';
import {dateTime,tr} from './settings';
import './pickup-chat.css';

type Message={id:string;sender:'seller'|'collector';text:string;createdAt:number};
type Conversation={messages:Message[];writable:boolean;truncated:boolean};

class ChatAccessError extends Error {}

async function requestMessages(token:string,body:object,signal?:AbortSignal):Promise<Conversation>{
  const response=await fetch('/api/pickup/chat/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(body),
    signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])]),
  });
  const result=await response.json();
  if(response.status===401||response.status===403)throw new ChatAccessError(result.error);
  if(!response.ok)throw new Error(result.error);
  return result;
}

export default function PickupChat({account,contract,lotId,collector,seller,completed,expanded=false}:{
  account:Address;contract:Address;lotId:number;collector:Address;seller:boolean;completed:boolean;expanded?:boolean;
}){
  const inputId=useId();
  const [open,setOpen]=useState(expanded);
  const [token,setToken]=useState('');
  const [conversation,setConversation]=useState<Conversation>();
  const [draft,setDraft]=useState('');
  const [loading,setLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [refreshError,setRefreshError]=useState('');
  const list=useRef<HTMLDivElement>(null);
  const retry=useRef<{text:string;messageId:string}|null>(null);
  const busy=useRef(false);
  const lastMessage=conversation?.messages.at(-1)?.id;
  const keepAtBottom=useRef(true);

  useEffect(()=>{
    if(!open||!token||sending)return;
    const request=new AbortController();
    let timer:number;
    async function refresh(){
      try{
        const result=await requestMessages(token,{},request.signal);
        if(request.signal.aborted||busy.current)return;
        setConversation(result);
        setRefreshError('');
      }catch(error){
        if(request.signal.aborted||busy.current)return;
        if(error instanceof ChatAccessError){
          setToken('');
          setConversation(undefined);
          setError(error.message);
          return;
        }
        setRefreshError('Đang thử tải lại tin nhắn.');
      }
      if(!request.signal.aborted)timer=window.setTimeout(refresh,5000);
    }
    void refresh();
    return()=>{request.abort();window.clearTimeout(timer);};
  },[open,token,sending]);

  useEffect(()=>{
    if(open&&list.current&&keepAtBottom.current)list.current.scrollTop=list.current.scrollHeight;
  },[open,lastMessage]);

  async function unlock(){
    if(busy.current)return;
    busy.current=true;
    setLoading(true);
    setError('');
    try{
      const scope={lotId,collector:collector.toLowerCase()};
      const hash=await digest(new TextEncoder().encode(JSON.stringify(scope)).buffer as ArrayBuffer);
      const auth=await authorize('pickup-chat',account,hash,contract);
      const {token}=await api('/api/pickup/chat/session',{...scope,auth});
      setToken(token);
    }catch(error){
      const message=error instanceof Error&&error.message;
      setError(message==='Kho lưu tin nhắn chưa được cấu hình.'||message==='Chỉ người bán và người thu gom đã nhận lô được mở chat.'
        ?message:'Không thể mở chat. Kiểm tra ví và thử lại.');
    }finally{
      busy.current=false;
      setLoading(false);
    }
  }

  async function send(event:FormEvent){
    event.preventDefault();
    const text=draft.trim();
    if(!text||!token||busy.current||completed||!conversation?.writable)return;
    busy.current=true;
    const message=retry.current?.text===text?retry.current:{text,messageId:crypto.randomUUID()};
    retry.current=message;
    setError('');
    setSending(true);
    try{
      const result=await requestMessages(token,message);
      keepAtBottom.current=true;
      setConversation(result);
      setDraft('');
      retry.current=null;
    }catch(error){
      if(error instanceof ChatAccessError){
        setToken('');
        setConversation(undefined);
        setError(error.message);
      }else{
        setError('Chưa gửi được tin nhắn. Hãy thử lại.');
      }
    }finally{
      busy.current=false;
      setSending(false);
    }
  }

  return <details open={expanded||undefined} className={expanded?"pickup-chat pickup-chat-expanded":"pickup-chat"} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><MessageCircle size={18} aria-hidden="true"/>{seller?tr('Chat với người thu gom'):tr('Chat với người bán')}</summary>
    {open&&<div className="pickup-chat-body">
      {!token&&<button className="secondary" type="button" disabled={loading} onClick={unlock}>{loading?tr('Đang chờ xác nhận từ ví…'):tr('Xác nhận ví để mở chat')}</button>}
      {token&&!conversation&&!refreshError&&<p role="status">{tr('Đang tải tin nhắn…')}</p>}
      {conversation&&<>
        {conversation.truncated&&<p>{tr('Hiển thị 200 tin nhắn gần nhất.')}</p>}
        <div ref={list} className="pickup-chat-messages" role="log" aria-label={tr('Lịch sử tin nhắn')} tabIndex={0} onScroll={event=>{
          const element=event.currentTarget;
          keepAtBottom.current=element.scrollHeight-element.scrollTop-element.clientHeight<40;
        }}>
          {conversation.messages.length===0&&<p>{tr('Chưa có tin nhắn.')}</p>}
          {conversation.messages.map(message=><article key={message.id} className={message.sender===(seller?'seller':'collector')?'pickup-chat-own':''}>
            <div className="pickup-chat-meta">
              <strong>{message.sender==='seller'?tr('Người Bán'):tr('Người Thu Gom')}</strong>
              <time dateTime={new Date(message.createdAt).toISOString()}>{dateTime(message.createdAt)}</time>
            </div>
            <p>{message.text}</p>
          </article>)}
        </div>
        {completed||!conversation.writable?<p>{tr('Lô đã hoàn tất bàn giao. Bạn vẫn có thể xem tin nhắn.')}</p>:
          <form className="pickup-chat-compose" onSubmit={send}>
            <label className="pickup-chat-label" htmlFor={inputId}>{tr('Tin nhắn bàn giao')}</label>
            <input id={inputId} value={draft} onChange={event=>setDraft(event.target.value)} maxLength={500} disabled={sending}
              placeholder={tr('Nhắn về giờ hẹn hoặc địa điểm…')}/>
            <button className="primary" type="submit" disabled={!draft.trim()||sending}>
              <Send size={16} aria-hidden="true"/>{tr('Gửi')}
            </button>
          </form>}
      </>}
      {refreshError&&token&&<p role="status">{tr(refreshError)}</p>}
      {error&&<p className="form-error" role="alert">{tr(error)}</p>}
    </div>}
  </details>;
}
