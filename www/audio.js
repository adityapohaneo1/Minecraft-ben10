/* =========================================================================
   AUDIO ENGINE  (shared by index.html = start page, and game.html = the game)

   - Short sounds (sfx) are fetched and DECODED into memory before play (Audio_.preload),
     so they fire instantly and never depend on the browser lazily loading an <audio> tag.
   - Music (title + back1..3) is fetched fully into memory (blob URLs) before play, so a track
     starts the moment it is asked to.
   - If a real recording exists for a sound, ONLY the recording plays. The built-in synth sound is
     used only for names that have no file in sounds/.
   - ONE music state decides what is audible: 'none' | 'title' | 'game'. Switching state fades the
     old track out and the new one in, so title music and in-game music can never overlap.
   - Nothing is audible until the browser allows audio (first tap). Loading screens never call
     Audio_.music(), so they are silent.
========================================================================= */
(function(){
'use strict';
const DIR='sounds/';
const MUSIC_GAME=['back1','back2','back3'];
const SFX_NAMES=['hbfly','flame','explosion2','burning','crystal','swoosh','swoosh_xlr8','uiclick','mutate','punch','hit','heavy','footstep','crash','explosion','horn','jump','land','scream','timeout','ambient','engine'];
const MUSIC_NAMES=['title'].concat(MUSIC_GAME);

let ctx=null, sfxBus=null;
const buffers={};          // sfx name -> AudioBuffer
const missing={};          // name -> true when the file does not exist / could not be decoded
const music={};            // music name -> HTMLAudioElement (blob url, fully in memory)
const loops={};
const clamp01=v=>Math.max(0,Math.min(1,v));

function ac(){
  if(!ctx){ try{ const C=window.AudioContext||window.webkitAudioContext; if(!C) return null;
    ctx=new C({latencyHint:'interactive'}); sfxBus=ctx.createGain(); sfxBus.gain.value=1; sfxBus.connect(ctx.destination);
    ctx.onstatechange=()=>{ if(ctx.state==='running') onUnlocked(); }; }catch(e){ ctx=null; } }
  return ctx;
}
const out=()=>sfxBus||(ctx&&ctx.destination);
const running=()=>!!(ctx&&ctx.state==='running');

/* ---------------------------- preloading ---------------------------- */
function fetchBuf(url){ return fetch(url).then(r=>{ if(!r.ok) throw new Error(r.status); return r.arrayBuffer(); }); }
function loadSfx(name){
  if(buffers[name]||missing[name]) return Promise.resolve();
  const a=ac(); if(!a){ missing[name]=true; return Promise.resolve(); }
  return fetchBuf(DIR+name+'.mp3').then(ab=>new Promise((res,rej)=>{ const p=a.decodeAudioData(ab,res,rej); if(p&&p.catch) p.catch(rej); }))
    .then(b=>{ buffers[name]=b; }).catch(()=>{ missing[name]=true; });
}
function loadMusic(name){
  if(music[name]||missing[name]) return Promise.resolve();
  return fetchBuf(DIR+name+'.mp3').then(ab=>new Promise((res,rej)=>{
      const el=new Audio(); el.preload='auto'; el.src=URL.createObjectURL(new Blob([ab],{type:'audio/mpeg'}));
      el.loop=(name==='title'); el.volume=0;
      const ok=()=>{ el.removeEventListener('canplaythrough',ok); el.removeEventListener('loadeddata',ok); music[name]=el; res(); };
      el.addEventListener('canplaythrough',ok); el.addEventListener('loadeddata',ok); el.addEventListener('error',()=>rej(new Error('decode')));
      setTimeout(ok,4000);                                  // some WebViews never fire the events for a blob: it is in memory already, go on
      try{ el.load(); }catch(e){}
    })).catch(()=>{ missing[name]=true; });
}
// names: array of sound names (sfx and/or music). onProgress(done,total,name) after every file.
function preload(names,onProgress){
  let done=0; const total=names.length; if(!total) return Promise.resolve();
  return Promise.all(names.map(n=>(MUSIC_NAMES.indexOf(n)>=0?loadMusic(n):loadSfx(n)).then(()=>{ done++; if(onProgress) try{ onProgress(done,total,n); }catch(e){} })));
}

/* ---------------------------- one-shots and loops ---------------------------- */
const live={};                                            // name -> number of currently playing copies (polyphony cap)
function sample(n,vol,rate,maxDur){
  const b=buffers[n]; if(!b) return false;                // no recording: caller falls back to the synth sound
  if(!running()) return true;                             // a recording exists but audio is still locked: stay silent, do NOT fall back to the synth
  if((live[n]||0)>=6) return true;
  try{ const s=ctx.createBufferSource(), g=ctx.createGain(); s.buffer=b; if(rate) s.playbackRate.value=rate; g.gain.value=clamp01(vol==null?.8:vol);
    s.connect(g); g.connect(out()); if(maxDur){ const t=ctx.currentTime; g.gain.setValueAtTime(g.gain.value,t+maxDur*.7); g.gain.linearRampToValueAtTime(0,t+maxDur); } live[n]=(live[n]||0)+1; s.onended=()=>{ live[n]=Math.max(0,(live[n]||1)-1); try{ g.disconnect(); }catch(e){} }; s.start(); if(maxDur) s.stop(ctx.currentTime+maxDur+.02); }catch(e){}
  return true;
}
// looping recordings (flamethrower, flight, scream): loop(name,true,vol) starts / keeps it going, loop(name,false) stops it
function loop(n,on,vol){
  const b=buffers[n]; if(!b) return false;
  const v=clamp01(vol==null?.7:vol); let L=loops[n];
  if(on){
    if(!running()) return true;
    if(!L){ try{ const s=ctx.createBufferSource(), g=ctx.createGain(); s.buffer=b; s.loop=true; g.gain.value=0; s.connect(g); g.connect(out()); s.start(); L=loops[n]={s,g}; }catch(e){ return true; } }
    L.g.gain.setTargetAtTime(v,ctx.currentTime,.015);
  } else if(L){
    delete loops[n]; try{ L.g.gain.setTargetAtTime(0,ctx.currentTime,.03); L.s.stop(ctx.currentTime+.14); }catch(e){}
  }
  return true;
}
function stopAllLoops(){ Object.keys(loops).forEach(n=>loop(n,false)); }

/* ---------------------------- music state machine ---------------------------- */
const M={want:'none', cur:null, track:0, vol:{title:.5,game:.35}, gameOn:false, fade:{}, resumeAt:0};
function fadeTo(el,to,ms,done){
  if(!el) return; clearInterval(M.fade[el.src]); const from=el.volume, t0=performance.now();
  if(ms<=0){ el.volume=to; if(done) done(); return; }
  M.fade[el.src]=setInterval(()=>{ const k=Math.min(1,(performance.now()-t0)/ms); try{ el.volume=clamp01(from+(to-from)*k); }catch(e){}
    if(k>=1){ clearInterval(M.fade[el.src]); if(done) done(); } },30);
}
function stopCur(pause){
  const c=M.cur; if(!c) return; M.cur=null; c.stopped=true;
  fadeTo(c.el,0,pause?220:120,()=>{ try{ c.el.pause(); }catch(e){} if(!pause){ try{ c.el.currentTime=0; }catch(e){} } });
}
function playEl(name,vol){
  const el=music[name]; if(!el) return false;
  const c={name,el,stopped:false}; M.cur=c;
  el.onended=null;
  if(name!=='title'){ el.loop=false; el.onended=()=>{ if(M.cur===c&&!c.stopped) nextTrack(); }; }
  try{ el.volume=0; const p=el.play(); if(p&&p.catch) p.catch(()=>{ if(M.cur===c){ M.cur=null; M.blocked=true; } }); }catch(e){ M.cur=null; M.blocked=true; return false; }
  fadeTo(el,vol,350); return true;
}
function nextTrack(){
  M.track=(M.track+1)%MUSIC_GAME.length;
  const n=MUSIC_GAME[M.track]; if(music[n]){ try{ music[n].currentTime=0; }catch(e){} }
  if(M.want==='game') applyMusic(true);
}
function curWanted(){ return M.want==='game'&&!M.gameOn?'none':M.want; }
function applyMusic(force){
  M.blocked=false;
  if(document.hidden) return;
  const w=curWanted();
  if(w==='none'){ stopCur(false); return; }
  if(w==='title'){
    if(M.cur&&M.cur.name==='title'&&!M.cur.el.paused) return;
    stopCur(true); if(music.title){ try{ if(!M.cur) music.title.currentTime=music.title.currentTime||0; }catch(e){} playEl('title',M.vol.title); } return;
  }
  // game
  const name=MUSIC_GAME[M.track];
  if(!force&&M.cur&&M.cur.name===name&&!M.cur.el.paused) return;
  if(M.cur&&M.cur.name!==name) stopCur(M.cur.name!=='title'?true:false);
  else if(M.cur) stopCur(false);
  if(music[name]) playEl(name,M.vol.game);
}
function setWant(w){ M.want=w; applyMusic(); }

/* ---------------------------- unlock / lifecycle ---------------------------- */
function onUnlocked(){ applyMusic(); startAmbient(); }
function unlock(){
  const a=ac(); if(a&&a.state==='suspended'){ try{ const p=a.resume(); if(p&&p.then) p.then(()=>{ if(a.state==='running') onUnlocked(); }).catch(()=>{}); }catch(e){} }
  if(M.blocked||!M.cur) applyMusic();
}
['pointerdown','touchstart','touchend','mousedown','keydown','click'].forEach(t=>{ try{ addEventListener(t,unlock,{capture:true,passive:true}); }catch(e){} });
try{ document.addEventListener('visibilitychange',()=>{
  if(document.hidden){ if(M.cur){ try{ M.cur.el.pause(); }catch(e){} } stopAllLoops(); if(ctx&&ctx.state==='running') try{ ctx.suspend(); }catch(e){} }
  else { if(ctx&&ctx.state==='suspended') try{ ctx.resume(); }catch(e){} if(M.cur){ try{ const p=M.cur.el.play(); if(p&&p.catch) p.catch(()=>{ M.blocked=true; }); }catch(e){} } else applyMusic(); }
}); }catch(e){}

/* ---------------------------- synth fallbacks (used only when no recording exists) ---------------------------- */
function beep(freq,dur,type,vol,glideTo){
  try{ const a=ac(); if(!a||!running()) return;
    const o=a.createOscillator(), g=a.createGain();
    o.type=type||'sine'; o.frequency.setValueAtTime(freq,a.currentTime);
    if(glideTo) o.frequency.exponentialRampToValueAtTime(glideTo,a.currentTime+dur);
    g.gain.setValueAtTime(vol||0.15,a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+dur);
    o.connect(g); g.connect(out()); o.start(); o.stop(a.currentTime+dur); }catch(e){}
}
let noiseBuf=null;
function nbuf(){ const a=ac(); if(!a) return null; if(!noiseBuf){ noiseBuf=a.createBuffer(1,a.sampleRate*2,a.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; } return noiseBuf; }
function nz(dur,vol,f0,f1,type,q){
  try{ const a=ac(); if(!a||!running()) return; const buf=nbuf(); if(!buf) return;
    const src=a.createBufferSource(); src.buffer=buf; src.loop=true;
    const fl=a.createBiquadFilter(); fl.type=type||'lowpass'; fl.Q.value=q||.8; fl.frequency.setValueAtTime(f0||1000,a.currentTime);
    if(f1) fl.frequency.exponentialRampToValueAtTime(f1,a.currentTime+dur);
    const g=a.createGain(); g.gain.setValueAtTime(0.0001,a.currentTime); g.gain.exponentialRampToValueAtTime(vol||.2,a.currentTime+Math.min(.02,dur*.3)); g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+dur);
    src.connect(fl); fl.connect(g); g.connect(out()); src.start(a.currentTime,Math.random()); src.stop(a.currentTime+dur+.02); }catch(e){}
}
const thump=(f,dur,vol)=>beep(f,dur,'sine',vol,Math.max(20,f*.4));
// persistent loops: engine, tyre screech, ambience
let eng=null, scr=null, amb=null, horn=null;
function ensureEngine(){ const a=ac(); if(!a||!running()||eng) return eng;
  try{ const o1=a.createOscillator(), o2=a.createOscillator(), fl=a.createBiquadFilter(), g=a.createGain();
    o1.type='sawtooth'; o2.type='square'; fl.type='lowpass'; fl.frequency.value=520; g.gain.value=0;
    o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(out()); o1.start(); o2.start(); eng={o1,o2,fl,g}; }catch(e){ eng=null; }
  return eng; }
function ensureScreech(){ const a=ac(); if(!a||!running()||scr) return scr;
  try{ const buf=nbuf(); const src=a.createBufferSource(); src.buffer=buf; src.loop=true; const fl=a.createBiquadFilter(); fl.type='bandpass'; fl.frequency.value=2300; fl.Q.value=4; const g=a.createGain(); g.gain.value=0;
    src.connect(fl); fl.connect(g); g.connect(out()); src.start(); scr={g}; }catch(e){ scr=null; }
  return scr; }
function startAmbient(){ const a=ac(); if(!a||!running()||amb||!M.gameOn) return;
  try{ if(buffers.ambient){ amb={sample:true}; loop('ambient',true,.35); return; }
    const buf=nbuf(); const src=a.createBufferSource(); src.buffer=buf; src.loop=true; const fl=a.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=260; const g=a.createGain(); g.gain.value=.035;
    const lfo=a.createOscillator(), lg=a.createGain(); lfo.frequency.value=.13; lg.gain.value=.02; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(fl); fl.connect(g); g.connect(out()); src.start(); amb={g};
    setInterval(()=>{ if(Math.random()<.55&&!document.hidden){ const f=2300+Math.random()*1400; beep(f,.07,'sine',.012,f*1.25); setTimeout(()=>beep(f*1.1,.06,'sine',.01,f*1.4),110); } },6500);
  }catch(e){} }

let lastSonic=0;
const API={
  preload, sample, loop, SFX_NAMES, MUSIC_NAMES, MUSIC_GAME,
  has:n=>!!(buffers[n]||music[n]),
  // ---- music ----
  music:setWant,                                          // 'title' | 'game' | 'none'
  enableGame(on){ M.gameOn=!!on; if(on){ if(M.want==='none') M.want='game'; unlock(); applyMusic(); startAmbient(); } else applyMusic(); },
  menu(on){ setWant(on?'title':'game'); },                // pause page: title music over the paused game, game track resumes where it was
  stopMusic(){ setWant('none'); },
  playNextTrack(){ nextTrack(); },
  setMusicVolume(v){ M.vol.game=v; if(M.cur&&M.cur.name!=='title') try{ M.cur.el.volume=v; }catch(e){} },
  resume(){ unlock(); },                                  // make sure audio is allowed; never starts music by itself
  get state(){ return ctx?ctx.state:'none'; },
  // ---- sfx ----
  footstep(fast){ if(sample('footstep',.35,.9+Math.random()*.2)) return; nz(.075,fast?.09:.06,300+Math.random()*350,120,'lowpass',.7); if(fast) thump(78,.06,.05); },
  horn(){ if(sample('horn',.7)) return; beep(330,.28,'square',.07); setTimeout(()=>beep(415,.28,'square',.05),10); },
  crash(){ if(sample('crash',.9)) return; nz(.4,.34,1400,120,'lowpass',.7); thump(60,.3,.3); beep(180,.12,'square',.05,60); },
  explosion(){ if(sample(Math.random()<.5?'explosion':'explosion2',1)) return; nz(.9,.4,900,60,'lowpass',.6); thump(46,.7,.42); },
  jump(){ if(sample('jump',.5)) return; nz(.14,.05,500,1400,'bandpass',1.2); thump(190,.12,.06); },
  land(v){ if(sample('land',.5)) return; const k=Math.min(1,(v||8)/20); nz(.12+.1*k,.1+.12*k,420,90,'lowpass'); thump(70,.14,.1+.15*k); },
  breakBlock(){ nz(.16,.2,1800,300,'bandpass',.9); },
  place(){ thump(160,.08,.1); },
  // punch swing: ONLY a punch recording or the short synth whoosh. (It used to fall back to the 4 s 'swoosh' clip, which is the running/sprint sound.)
  attack(){ if(sample('punch',.5,.95+Math.random()*.15)) return; nz(.11,.1,600,2200,'bandpass',1.4); thump(210,.05,.03); },
  // projectile impact (fireball, seed bomb): the explosion recording at a lower level, pitch-varied and cut short so it stays a pop, not a 3 s boom
  blast(vol){ const v=(vol==null?.6:vol); if(sample(Math.random()<.5?'explosion':'explosion2',v,.92+Math.random()*.2,1.5)) return; nz(.45,.3*v,1100,80,'lowpass',.6); thump(55,.3,.3*v); },
  heavyHit(){ if(sample('heavy',.9)) return; thump(80,.3,.4); nz(.18,.28,700,90,'lowpass',.8); beep(240,.06,'square',.07,90); },
  hit(){ if(sample('hit',.8)) return; thump(150,.1,.24); nz(.07,.2,2400,700,'bandpass',1.1); },
  transform(){ if(sample('mutate',.7)) return; beep(220,.35,'sine',.18,880); setTimeout(()=>beep(880,.2,'sine',.15,440),120); },
  special(st){ if(st==='pulse'){ thump(130,.28,.3); beep(520,.25,'sawtooth',.1,160); nz(.2,.1,2600,500,'bandpass',1.6); return; }
    if(st==='crystal'&&sample('crystal',.8)) return; if(st==='fire'&&sample('burning',.7)) return; beep(400,.3,'sawtooth',.18,700); nz(.25,.08,900,3000,'bandpass',2); },
  // one blast of Echo Echo's sonic scream. While the scream button is held the looping recording already covers it (held=true) -> silence here.
  sonic(held){ if(held&&buffers.scream) return;
    if(buffers.scream){ const t=performance.now(); if(t-lastSonic<180) return; lastSonic=t; sample('scream',.6,1,.3); return; }   // short clip: a blast never keeps sounding after the button is released
    beep(1300,.55,'sawtooth',.14,300); beep(1750,.5,'square',.06,420); nz(.5,.1,4000,800,'bandpass',2); },
  scream(){ if(sample('scream',.8)) return; beep(1300,.55,'sawtooth',.14,300); beep(1750,.5,'square',.06,420); nz(.5,.1,4000,800,'bandpass',2); },
  death(){ beep(400,.6,'sawtooth',.2,60); thump(60,.5,.3); },
  click(){ if(sample('uiclick',.7)) return; beep(900,.04,'square',.05,600); },
  hurt(){ thump(110,.14,.3); nz(.09,.16,1500,400,'bandpass',1); beep(260,.12,'sawtooth',.06,140); },
  heartbeat(){ thump(62,.12,.28); setTimeout(()=>thump(54,.14,.2),170); },
  deny(){ beep(180,.16,'square',.08,120); },
  warn(){ beep(1200,.09,'square',.06); setTimeout(()=>beep(1200,.09,'square',.06),140); },
  timeout(){ if(sample('timeout',.8)) return; beep(900,.5,'sawtooth',.13,90); thump(70,.4,.25); },
  swoosh(x){ return sample(x?'swoosh_xlr8':'swoosh',.7); },
  // vehicle horn: sounds exactly while the button is held and cuts the moment it is released
  hornHold(on){
    if(buffers.horn){ loop('horn',on,.7); return; }
    const a=ac(); if(!a) return;
    if(on&&!horn&&running()){ try{ const g=a.createGain(), o1=a.createOscillator(), o2=a.createOscillator(); o1.type=o2.type='square'; o1.frequency.value=330; o2.frequency.value=415; g.gain.value=0; o1.connect(g); o2.connect(g); g.connect(out()); o1.start(); o2.start(); g.gain.setTargetAtTime(.07,a.currentTime,.01); horn={g,o1,o2}; }catch(e){} }
    else if(!on&&horn){ const h=horn; horn=null; try{ h.g.gain.cancelScheduledValues(a.currentTime); h.g.gain.setTargetAtTime(0,a.currentTime,.015); h.o1.stop(a.currentTime+.1); h.o2.stop(a.currentTime+.1); }catch(e){} } },
  // engine: sr = 0..1 fraction of top speed, thr = 0..1 throttle. Fake gearbox so it revs up, drops, revs again.
  engine(sr,thr){ const e=ensureEngine(); const a=ac(); if(!e||!a) return; const t=a.currentTime;
    const gear=Math.min(4,Math.floor(sr*5)), inG=sr*5-gear, rpm=Math.max(inG,thr*.3), f=48+gear*8+rpm*82;
    e.o1.frequency.setTargetAtTime(f,t,.06); e.o2.frequency.setTargetAtTime(f*.5,t,.06); e.fl.frequency.setTargetAtTime(340+rpm*700+thr*260,t,.08);
    e.g.gain.setTargetAtTime(.028+thr*.05+sr*.02,t,.1); },
  engineOff(){ if(eng){ const a=ac(); if(a) eng.g.gain.setTargetAtTime(0,a.currentTime,.12); } if(scr){ const a=ac(); if(a) scr.g.gain.setTargetAtTime(0,a.currentTime,.05); } },
  screech(k){ const s_=ensureScreech(); const a=ac(); if(!s_||!a) return; s_.g.gain.setTargetAtTime(Math.max(0,Math.min(.09,k*.09)),a.currentTime,.05); }
};
// build the audio context right away so decoding can start before the first tap (it stays silent/suspended until a tap)
ac();
window.Audio_=API;
})();
