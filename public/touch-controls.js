/* Mobile input layer adapted from uploaded Chaminuka v0.9.
   Uses the existing game input handlers to preserve server authority and reconnect. */
(() => {
 'use strict';
 const get = id => document.getElementById(id);
 const stage=get('stage'),canvas=get('c'),title=get('title');
 if(!stage||!canvas||!title)return;
 const style=document.createElement('style');
 style.textContent=[
 '#chamTouch{position:absolute;inset:0;z-index:24;pointer-events:none;display:none;touch-action:none}',
 '#chamTouch.live{display:block}',
 '#chamStickZone{position:absolute;left:0;bottom:0;width:48%;height:70%;pointer-events:auto;touch-action:none}',
 '#chamStick{position:absolute;width:112px;height:112px;margin:-56px 0 0 -56px;border:2px solid #bcdfff60;border-radius:50%;background:#0c102681;opacity:0;pointer-events:none}',
 '#chamStick.show{opacity:1}',
 '#chamNub{position:absolute;left:50%;top:50%;width:45px;height:45px;margin:-22.5px 0 0 -22.5px;border-radius:50%;background:#a9dafad9}',
 '#chamActions{position:absolute;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:flex-end;gap:7px;pointer-events:auto}',
 '#chamActions .chamRow{display:flex;gap:7px}',
 '.chamButton{font:600 11px ui-monospace,monospace;min-width:76px;padding:11px 10px;border-radius:11px;border:2px solid #ae956a;background:#21192fe8;color:#f5e4be;touch-action:none;user-select:none;-webkit-user-select:none}',
 '.chamButton.primary{min-width:94px;background:#684a24e8;border-color:#e8b84a}',
 '.chamButton.down{background:#4d376b}',
 '#chamRotate{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:#080711f2;color:#f5e4be;text-align:center;padding:20px;pointer-events:auto;font:16px ui-monospace,monospace}',
 '#chamRotate.show{display:flex}',
 '#chamToggle{font-size:11px;padding:9px 12px}',
 '@media(max-height:440px){.chamButton{font-size:10px;padding:8px 9px;min-width:66px}.chamButton.primary{min-width:85px}#chamStick{transform:scale(.83)}}'
 ].join('\n');
 document.head.appendChild(style);
 const layer=document.createElement('div');layer.id='chamTouch';
 layer.innerHTML='<div id="chamStickZone"><div id="chamStick"><div id="chamNub"></div></div></div>'+
 '<div id="chamActions"><div class="chamRow"><button class="chamButton" id="chamB" type="button">ABILITY</button>'+
 '<button class="chamButton" id="chamC" type="button">POSSESS</button></div>'+
 '<div class="chamRow"><button class="chamButton primary" id="chamA" type="button">WEAR</button>'+
 '<button class="chamButton" id="chamD" type="button">RUN</button></div></div>';
 stage.appendChild(layer);
 const rotate=document.createElement('div');rotate.id='chamRotate';
 rotate.innerHTML='<div><div style="font-size:40px;margin-bottom:15px">↻</div>'+
 '<b>TURN YOUR PHONE SIDEWAYS</b><p style="font-size:12px;max-width:24em">Rotate to landscape to make room for the joystick and game action buttons.</p></div>';
 document.body.appendChild(rotate);
 const toggle=document.createElement('button');toggle.id='chamToggle';toggle.type='button';
 const err=get('err');if(err)err.before(toggle);else title.appendChild(toggle);
 const coarse=()=>!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||
 navigator.maxTouchPoints>0||('ontouchstart' in window);
 let enabled=coarse(),live=false,act=1,stickId=null,runDown=false,ox=0,oy=0,aimId=null;
 const held=new Set();
 try{const v=localStorage.getItem('cham-touch');if(v!==null)enabled=v==='1';}catch(_){}
 const state=()=>{try{return window.__vessel?.state?.()||null;}catch(_){return null;}};
 function key(code,down){
  if(down){if(held.has(code))return;held.add(code);}
  else{if(!held.has(code))return;held.delete(code);}
  if(document.activeElement?.tagName==='INPUT')document.activeElement.blur();
  window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',
   {code,key:code==='Space'?' ':code,bubbles:true,cancelable:true}));
 }
 function press(code){key(code,false);key(code,true);setTimeout(()=>key(code,false),90);}
 function moving(x,y){
  const want=new Set();
  if(x>.25)want.add('KeyD');if(x<-.25)want.add('KeyA');
  if(y>.25)want.add('KeyS');if(y<-.25)want.add('KeyW');
  for(const k of ['KeyA','KeyD','KeyS','KeyW'])key(k,want.has(k));
 }
 function reset(){
  for(const k of [...held])key(k,false);
  stickId=null;aimId=null;runDown=false;
  get('chamStick').classList.remove('show');
  layer.querySelectorAll('button').forEach(el=>el.classList.remove('down'));
 }
 const zone=get('chamStickZone'),stick=get('chamStick'),nub=get('chamNub');
 zone.addEventListener('pointerdown',e=>{
  if(!live||stickId!==null)return;
  e.preventDefault();stickId=e.pointerId;ox=e.clientX;oy=e.clientY;
  const r=stage.getBoundingClientRect();
  stick.style.left=(ox-r.left)+'px';stick.style.top=(oy-r.top)+'px';
  nub.style.transform='translate(0px,0px)';stick.classList.add('show');
  zone.setPointerCapture(e.pointerId);
 });
 zone.addEventListener('pointermove',e=>{
  if(e.pointerId!==stickId)return;
  e.preventDefault();const x=e.clientX-ox,y=e.clientY-oy,d=Math.hypot(x,y),rad=42,k=d>rad?rad/d:1;
  nub.style.transform='translate('+(x*k)+'px,'+(y*k)+'px)';
  if(d<12)moving(0,0);else moving(x/Math.max(d,rad),y/Math.max(d,rad));
 });
 function endStick(e){
  if(e.pointerId!==stickId)return;
  stickId=null;moving(0,0);stick.classList.remove('show');
 }
 for(const evt of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(evt,endStick);
 const actions={
  chamA:()=>{const me=state()?.me;press(act===2?'KeyJ':(me?.form==='worn'?'Space':'KeyE'));},
  chamB:()=>press(act===2?'KeyK':'KeyF'),
  chamC:()=>press('KeyE'),
  chamD:()=>{if(act===2)return;runDown=!runDown;key('ShiftLeft',runDown);}
 };
 for(const [id,fn] of Object.entries(actions)){
  const el=get(id);
  el.addEventListener('pointerdown',e=>{
   if(!live)return;
   e.preventDefault();e.stopPropagation();el.setPointerCapture(e.pointerId);
   el.classList.add('down');fn();
  });
  for(const ev of ['pointerup','pointercancel'])el.addEventListener(ev,()=>el.classList.remove('down'));
 }
 function aimAt(e){
  canvas.dispatchEvent(new MouseEvent('mousemove',{clientX:e.clientX,clientY:e.clientY,bubbles:true}));
 }
 canvas.addEventListener('pointerdown',e=>{
  if(!live||act!==2||e.pointerType==='mouse')return;
  aimId=e.pointerId;aimAt(e);
 });
 canvas.addEventListener('pointermove',e=>{if(live&&act===2&&e.pointerId===aimId)aimAt(e);});
 const stopAim=e=>{if(aimId===e.pointerId)aimId=null;};
 canvas.addEventListener('pointerup',stopAim);
 canvas.addEventListener('pointercancel',stopAim);
 toggle.onclick=()=>{
  enabled=!enabled;reset();
  try{localStorage.setItem('cham-touch',enabled?'1':'0');}catch(_){}
  refresh();
 };
 function refresh(){
  const s=state();act=s?.act===2?2:1;
  const next=!!(enabled&&s?.phase==='run'&&s.me);
  if(live&&!next)reset();
  live=next;layer.classList.toggle('live',live);
  stage.style.touchAction=live?'none':'';
  toggle.textContent='TOUCH CONTROLS: '+(enabled?'ON':'OFF');
  rotate.classList.toggle('show',!!(live&&innerHeight>innerWidth*1.08));
  const worn=s?.me?.form==='worn';
  get('chamA').textContent=act===2?'ATTACK':(worn?'INFANT':'WEAR');
  get('chamB').textContent=act===2?'DODGE':'ABILITY';
  get('chamC').textContent=act===2?'SPIRIT':'POSSESS';
  get('chamD').textContent=act===2?'':'RUN'+(runDown?': ON':'');
  get('chamD').style.display=act===2?'none':'';
  get('chamD').classList.toggle('down',runDown);
 }
 window.addEventListener('blur',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 setInterval(refresh,125);refresh();
 window.__chaminukaTouch={enabled:()=>enabled,reset};
})();