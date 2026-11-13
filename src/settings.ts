// App-wide user settings (language, theme, text size, units, notifications) and the tiny i18n layer.
// Vietnamese is the source language: every UI string is written in Vietnamese and passed through tr(),
// which returns the English text from ./i18n.en.ts when the user picks English.
import {useSyncExternalStore} from 'react';
import {en,enPatterns} from './i18n.en';

export type Language='vi'|'en';
export type LanguagePref=Language|'system';
export type ThemePref='light'|'dark'|'system';
export type FontSize='small'|'medium'|'large'|'xlarge';
export type WeightUnit='kg'|'lb';
export type NumberFormat='auto'|'vi'|'en';
export type LayoutPref='auto'|'desktop'|'mobile';
export type Layout='desktop'|'mobile';

export interface Settings{
  language:LanguagePref;
  theme:ThemePref;
  fontSize:FontSize;
  weightUnit:WeightUnit;
  numberFormat:NumberFormat;
  notifications:boolean;
  reduceMotion:boolean;
  layout:LayoutPref;
}

export const DEFAULT_SETTINGS:Settings={language:'vi',theme:'light',fontSize:'medium',weightUnit:'kg',numberFormat:'auto',notifications:false,reduceMotion:false,layout:'auto'};
export const SETTINGS_KEY='ecoloop-settings-v1';
export const FONT_SCALE:Record<FontSize,number>={small:.9,medium:1,large:1.12,xlarge:1.25};
const LB_PER_KG=2.20462;

function read():Settings{
  try{
    const raw=JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY)||'null');
    if(raw&&typeof raw==='object')return {...DEFAULT_SETTINGS,...raw};
  }catch{/* private mode or corrupted value */}
  return {...DEFAULT_SETTINGS};
}

let state:Settings=read();
const listeners=new Set<()=>void>();

export function getSettings(){return state;}
export function subscribeSettings(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function updateSettings(patch:Partial<Settings>){
  state={...state,...patch};
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(state));}catch{/* keep in memory only */}
  applySettings();
  listeners.forEach(fn=>fn());
}
export function resetSettings(){updateSettings({...DEFAULT_SETTINGS});}
export function useSettings(){return useSyncExternalStore(subscribeSettings,getSettings,getSettings);}

export function systemLanguage():Language{
  const lang=(globalThis.navigator?.language||'vi').toLowerCase();
  return lang.startsWith('vi')?'vi':'en';
}
export function currentLanguage():Language{return state.language==='system'?systemLanguage():state.language;}
export function prefersDark(){return !!globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;}
export function resolvedTheme():'light'|'dark'{return state.theme==='system'?(prefersDark()?'dark':'light'):state.theme;}

/** Phone layout on narrow screens, and on touch screens held sideways (landscape phones).
 *  Rotating a phone or resizing a window switches live. */
export const MOBILE_QUERY='(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
export function isNarrowScreen(){return !!globalThis.matchMedia?.(MOBILE_QUERY).matches;}
export function resolvedLayout():Layout{return state.layout==='auto'?(isNarrowScreen()?'mobile':'desktop'):state.layout;}
/** Current layout; components re-render when the screen crosses the breakpoint or the setting changes. */
export function useLayout():Layout{useSettings();return resolvedLayout();}

/** Translate a Vietnamese UI string. `{name}` placeholders are filled from vars. */
export function tr(text:string,vars?:Record<string,string|number>):string{
  let out=text;
  if(currentLanguage()==='en'){
    const hit=en[text];
    if(hit!==undefined)out=hit;
    else for(const [re,rep] of enPatterns)if(re.test(text)){out=text.replace(re,rep);break;}
  }
  if(vars)for(const [k,v] of Object.entries(vars))out=out.split(`{${k}}`).join(String(v));
  return out;
}

/** Locale for dates and text. */
export function locale(){return currentLanguage()==='en'?'en-US':'vi-VN';}
/** Locale for numbers: follows language unless the user picked a separator style. */
export function numberLocale(){return state.numberFormat==='vi'?'vi-VN':state.numberFormat==='en'?'en-US':locale();}
export function num(n:number,digits=3){return new Intl.NumberFormat(numberLocale(),{maximumFractionDigits:digits}).format(n);}
export function money(vnd:number){return `${vnd.toLocaleString(numberLocale())} ₫`;}
export function dateTime(value:number|string|Date,options?:Intl.DateTimeFormatOptions){return new Date(value).toLocaleString(locale(),options);}
export function unit(){return state.weightUnit;}
/** Format a weight given in kilograms using the selected unit, e.g. "2,5 kg" or "5.51 lb". */
export function wt(kg:number,digits=3){return state.weightUnit==='lb'?`${num(kg*LB_PER_KG,Math.min(digits,1))} lb`:`${num(kg,digits)} kg`;}

export function applySettings(){
  if(typeof document==='undefined')return;
  const root=document.documentElement;
  root.lang=currentLanguage();
  root.dataset.theme=resolvedTheme();
  root.dataset.motion=state.reduceMotion?'reduce':'full';
  root.dataset.layout=resolvedLayout();
  // a phone layout forced on a wide screen is shown as a centred phone-width column
  root.dataset.viewport=isNarrowScreen()?'narrow':'wide';
  root.style.setProperty('--ecoloop-zoom',String(FONT_SCALE[state.fontSize]));
  root.style.colorScheme=resolvedTheme();
  document.title=tr('EcoLoop — Gom điều cũ, gieo điều xanh');
}

if(typeof window!=='undefined'){
  applySettings();
  // new state object so useSyncExternalStore subscribers re-render when the breakpoint is crossed
  window.matchMedia?.(MOBILE_QUERY).addEventListener?.('change',()=>{state={...state};applySettings();listeners.forEach(fn=>fn());});
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.theme==='system'){applySettings();listeners.forEach(fn=>fn());}});
  window.addEventListener('languagechange',()=>{if(state.language==='system'){applySettings();listeners.forEach(fn=>fn());}});
  window.addEventListener('storage',e=>{if(e.key===SETTINGS_KEY){state=read();applySettings();listeners.forEach(fn=>fn());}});
}

// ---- Browser notifications -------------------------------------------------------------
export function notificationSupport():'unsupported'|NotificationPermission{
  return typeof Notification==='undefined'?'unsupported':Notification.permission;
}
export async function enableNotifications():Promise<boolean>{
  if(typeof Notification==='undefined')return false;
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  const ok=permission==='granted';
  updateSettings({notifications:ok});
  return ok;
}
export function notify(title:string,body:string){
  if(!state.notifications||typeof Notification==='undefined'||Notification.permission!=='granted')return;
  try{new Notification(title,{body,icon:'/favicon.svg',tag:'ecoloop'});}catch{/* some mobile browsers require a service worker */}
}

// ---- Local data ------------------------------------------------------------------------
/** Keys this app keeps in the browser (cached catalog, rewards, wallet choice, pending tx...). */
export function localDataKeys(){
  const keys:string[]=[];
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('ecoloop')&&k!==SETTINGS_KEY)keys.push(k);}}catch{/* unavailable */}
  return keys;
}
export function localDataSize(){
  let bytes=0;
  for(const k of localDataKeys()){try{bytes+=(k.length+(localStorage.getItem(k)||'').length)*2;}catch{/* ignore */}}
  return bytes;
}
export function clearLocalData(){for(const k of localDataKeys()){try{localStorage.removeItem(k);}catch{/* ignore */}}}
