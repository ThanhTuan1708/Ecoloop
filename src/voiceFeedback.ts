import {getSettings,subscribeSettings} from './settings';

export function supportsVoiceFeedback(){
  return typeof window!=='undefined'&&!!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
}

export function speakFeedback(message:string,onError?:()=>void){
  if(!getSettings().voiceFeedback||!supportsVoiceFeedback()||document.hidden)return;
  const speech=window.speechSynthesis;
  const utterance=new SpeechSynthesisUtterance(message);
  utterance.lang='vi-VN';
  const vietnamese=speech.getVoices().filter(voice=>/^vi(?:-|$)/i.test(voice.lang));
  const microsoft=vietnamese.filter(voice=>/Microsoft/i.test(voice.name));
  const voice=microsoft.find(voice=>/Online|Natural/i.test(voice.name))||microsoft[0]||vietnamese[0];
  if(voice)utterance.voice=voice;
  utterance.onerror=event=>{
    if(event.error!=='canceled'&&event.error!=='interrupted')onError?.();
  };
  try{
    speech.cancel();
    speech.speak(utterance);
  }catch{
    onError?.();
  }
}

export function previewVoiceFeedback(onError?:()=>void){
  speakFeedback('Xin chào. EcoLoop sẽ đọc các thông báo quan trọng.',onError);
}

if(supportsVoiceFeedback()){
  let wasEnabled=getSettings().voiceFeedback;
  subscribeSettings(()=>{
    const enabled=getSettings().voiceFeedback;
    if(wasEnabled&&!enabled)window.speechSynthesis.cancel();
    wasEnabled=enabled;
  });
}
