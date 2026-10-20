import {$,name,rpc,saved,toast} from './ui';
import {MEMBERS,type Member} from './ledger';
import {identity} from './identity';

type Device={registered:boolean;enabled?:boolean;member?:Member;categories?:string[];last_sent_at?:string;last_error?:string};
type PushConfig={enabled:boolean;public_key:string};
let config:PushConfig|undefined,device:Device={registered:false},registration:ServiceWorkerRegistration|undefined,busy=false;
const tokenKey='household-push-token';
const installed=()=>matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator & {standalone?:boolean}).standalone;
const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const supported=()=>isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const message=(text:string)=>{$('#push-message').textContent=text;};
function deviceToken(){
 let token=saved(tokenKey);
 if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(tokenKey,token);}
 if(saved(tokenKey)!==token)throw new Error('Allow local storage so this phone can remember its notification settings.');
 return token;
}
async function operation(action:string,extra:Record<string,unknown>={}){
 device=await rpc<Device>('push_device',{p:{token:deviceToken(),action,...extra}});
}
function permission(){return 'Notification' in window?Notification.permission:'default';}
function render(){
 const needsInstall=ios()&&!installed(),available=supported()&&!needsInstall,enabled=device.enabled&&permission()==='granted';
 $('#push-install').hidden=!needsInstall;
 $('#push-platform-help').textContent=ios()?'Requires iOS 16.4 or later. Enable notifications from the Home Screen app.':
  /Android/i.test(navigator.userAgent)?'Works in supported Android browsers, including Chrome. Installing the home-screen shortcut is optional.':'Enable alerts in a supported browser on this device. Each phone or computer opts in separately.';
 $('#push-status').textContent=enabled?`Receiving alerts for ${name(device.member!)} on this device.`:
  permission()==='denied'?'Notifications are blocked. Allow them in your browser or phone notification settings, then reopen this panel.':
  needsInstall?'One small setup step on iPhone.':!available?'This browser does not support phone notifications. Try a current version of Safari on iPhone or Chrome on Android.':
  config?.enabled?'Choose your name and enable notifications.':'Phone notifications are awaiting household setup.';
 $<HTMLSelectElement>('#push-person').value=device.member||identity||'';
 document.querySelectorAll<HTMLInputElement>('[name="push-category"]').forEach(el=>el.checked=(device.categories||['bills','chores','notes']).includes(el.value));
 $('#push-enable').textContent=enabled?'Save notification settings':'Enable notifications';
 $('#push-enable').toggleAttribute('disabled',busy||!available||!config?.enabled||permission()==='denied');
 $('#push-test').hidden=!enabled;$('#push-disable').hidden=!device.registered;
 $('#push-test').toggleAttribute('disabled',busy||!config?.enabled);
 $('#push-disable').toggleAttribute('disabled',busy);
 $('#push-delivery').textContent=device.last_error?
  (device.last_error==='push_http_410'||device.last_error==='push_http_404'?'This subscription expired. Enable notifications again.':'The last delivery could not be completed. Try a test notification or reconnect this device.'):
  device.last_sent_at?`Last accepted by the push service: ${new Date(device.last_sent_at).toLocaleString()}`:'';
}
async function load(){
 message('Checking this device…');
 try{
  config=await rpc<PushConfig>('push_config');
  if(saved(tokenKey))await operation('status');
  if(supported())registration=await navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:new URL('.',document.baseURI).pathname,updateViaCache:'none'});
  render();message('');
  }catch{config=undefined;render();message('Could not check notification settings. Refresh when the shared database is available, or complete household notification setup.');}
}
export function initNotifications(){
 document.body.insertAdjacentHTML('beforeend',`<dialog id="push-dialog" class="push-dialog" aria-labelledby="push-heading"><form id="push-form">
 <div class="dialog-top"><h2 id="push-heading" tabindex="-1" autofocus>A little heads-up.</h2><button type="button" id="push-close" class="icon-button" aria-label="Close notifications">×</button></div>
 <p class="dialog-description">Chores, new bills, and notes for you. No account needed.</p>
 <p id="push-status" class="push-status" role="status"></p>
 <div id="push-install" class="push-install" hidden><strong>Add household to your Home Screen</strong><ol><li>Open this site in Safari and tap Share.</li><li>Choose Add to Home Screen, then Add.</li><li>Open the new household icon, tap the bell, and enable notifications.</li></ol></div>
 <p id="push-platform-help" class="field-help"></p>
 <label for="push-person">Whose alerts should this device receive?</label><select id="push-person" required><option value="">Choose your name</option>${MEMBERS.map(m=>`<option value="${m}">${name(m)}</option>`).join('')}</select>
 <p class="field-help">This stays the same when you switch whose dashboard you’re viewing.</p>
 <fieldset class="push-categories"><legend>Keep me in the loop about</legend>${[['chores','My chores','Assignments and one reminder when due.'],['bills','New utility bills','A heads-up when your share is ready.'],['notes','Notes for me','Only the sender appears in the alert.']].map(([value,label,help])=>`<label><input type="checkbox" name="push-category" value="${value}" checked><span>${label}<small>${help}</small></span></label>`).join('')}</fieldset>
 <p class="field-help">Quiet from 10 p.m. to 8 a.m. New York time. Date-only chores remind you at 9 a.m. Your phone’s Focus settings still apply.</p>
 <p id="push-message" class="form-error" role="status" aria-live="polite"></p><p id="push-delivery" class="field-help"></p>
 <div class="dialog-actions"><button type="button" id="push-disable" class="text-button" hidden>Disable on this device</button><button type="submit" id="push-enable" class="button primary" disabled>Enable notifications</button></div>
 <button type="button" id="push-test" class="button secondary push-test" hidden>Send test notification</button></form></dialog>`);
 $('#notifications').addEventListener('click',()=>{$<HTMLDialogElement>('#push-dialog').showModal();$('#push-heading').focus();render();void load();});
 $('#push-close').addEventListener('click',()=>{if(!busy)$<HTMLDialogElement>('#push-dialog').close();});
 $('#push-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 $('#push-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const member=$<HTMLSelectElement>('#push-person').value;
  if(!MEMBERS.includes(member as Member)){message('Choose whose alerts this phone should receive.');return;}
  const categories=[...document.querySelectorAll<HTMLInputElement>('[name="push-category"]:checked')].map(el=>el.value);
  busy=true;$('#push-enable').setAttribute('disabled','');message('');
  try{
   deviceToken();
   // Keep the permission call in the tap handler; iOS requires user activation.
   const allowed=permission()==='granted'?'granted':await Notification.requestPermission();
   if(allowed!=='granted')throw new Error('Notifications were not enabled. You can opt in later from this panel.');
   const reg=registration||await navigator.serviceWorker.ready;
   await navigator.serviceWorker.ready;
   let sub=await reg.pushManager.getSubscription();
   if(sub&&(!device.registered||!device.enabled)){await sub.unsubscribe();sub=null;}
   if(!sub){
    const key=Uint8Array.from(atob(config!.public_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   }
   await operation('register',{member,categories,subscription:sub.toJSON()});
   message('Saved. This device will receive your alerts.');
  }catch(error){message(error instanceof Error?error.message:'Could not enable notifications. Please try again.');}
  finally{busy=false;render();}
 });
 $('#push-disable').addEventListener('click',async()=>{
  if(busy)return;busy=true;
  try{await operation('disable');await (await registration?.pushManager.getSubscription())?.unsubscribe();message('Notifications disabled on this device.');}
  catch{message('Could not disconnect this device. Please try again.');}
  finally{busy=false;render();}
 });
 $('#push-test').addEventListener('click',async()=>{
  if(busy)return;busy=true;$('#push-test').setAttribute('disabled','');
  try{await operation('test');message('Test queued. It should arrive within about a minute, even with the app closed. Tests bypass quiet hours.');}
  catch(error){message(error instanceof Error?error.message:'Could not send a test.');}
  finally{busy=false;render();}
 });
 if(saved(tokenKey)&&supported())void (async()=>{
  try{
   registration=await navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:new URL('.',document.baseURI).pathname,updateViaCache:'none'});
   await operation('status');
   if(device.enabled&&permission()!=='granted')await operation('disable');
   else if(device.enabled){
    await navigator.serviceWorker.ready;
    const sub=await registration.pushManager.getSubscription();
    if(sub)await operation('register',{member:device.member,categories:device.categories,subscription:sub.toJSON()});
   }
  }catch{/* Settings can retry explicitly; never disrupt a ledger. */}
 })();
}
export function highlightNotification(selector:string):boolean{
 const el=document.querySelector<HTMLElement>(selector);
 if(!el)return false;
 el.classList.add('notification-target');el.tabIndex=-1;el.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});el.focus({preventScroll:true});return true;
}
export function missingNotification(){toast('This item is no longer available. You can still browse this tab.');}
