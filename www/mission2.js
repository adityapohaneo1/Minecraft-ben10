/* =====================================================================================
   MISSION 02 - "GHOST IN THE MACHINE"  (plug-in for www/missions.js: window.Mission2(api) -> controller)
   Start: after Mission 01, Grandpa Max asks Ben to meet them at the Rust Bucket (charging START button like Mission 01).
   0  get in the Rust Bucket            1  DRIVE (player controls the vehicle) while scores of flying drones chase it
   91/2  at 47% hull: story beat, Ben leaps out   3  the Rust Bucket drives away (scripted) and Ben fights 3 drone waves
   4  find the parked Rust Bucket on foot          95 the evidence from Mission 01 has been stolen  -> done
   Everything here is data-driven from the real world: vehicle physics = the game's own arcade car code (game.html),
   drones = the real enemy objects (blade_drone / laser_drone) steered here during the chase and by the normal enemy AI
   afterwards, projectiles are small energy orbs handled by this file.
===================================================================================== */
(function(){
'use strict';
const TAU=Math.PI*2;
window.Mission2=function(A){
  const {G,THREE,scene,camera,player,enemies,VFX,Audio_,el,say,toast,talking}=A;
  const gy=(x,z)=>G.groundTopAt(x,z);
  const S={ status:'new', obj:-1, paused:false, cp:null, cp0:null, cpObj:-1, rb:null, trig:false };
  const rnd=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let clock=0, chargeT=0, beacon=null, offerWait=0, wrecked=0;
  const TITLE='GHOST IN THE MACHINE';

  /* ---------- UI: hull bar, leap-out button, chase chatter ---------- */
  const css=document.createElement('style'); css.textContent=`
  #mrbhp{position:fixed;z-index:26;left:12px;top:calc(max(8px,env(safe-area-inset-top,8px)) + 92px);width:164px;display:none;padding:5px 9px 7px;background:rgba(20,8,4,.86);border:1px solid #b5651d;border-left:3px solid #ff9a3c;border-radius:10px;color:#ffe6c8;font:800 10px sans-serif;letter-spacing:.12em;pointer-events:none}
  #mrbhp .bar{margin-top:4px;height:9px;background:#2a1408;border-radius:5px;overflow:hidden;position:relative}
  #mrbhp .bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ffb24a,#ff7a1e);transition:width .25s}
  #mrbhp .bar u{position:absolute;top:-1px;bottom:-1px;width:2px;background:#fff;opacity:.85;left:47%}
  #mrbhp.low .bar i{background:linear-gradient(90deg,#ff5a3a,#d11a1a)} #mrbhp b{float:right;color:#ffd9a8}
  #mexit{position:fixed;z-index:27;left:50%;transform:translateX(-50%);bottom:calc(max(14px,env(safe-area-inset-bottom,14px)) + 112px);display:none;min-width:210px;padding:14px 22px;border-radius:30px;border:2px solid #39ff8a;background:linear-gradient(180deg,#39ff8a,#17b862);color:#032a14;font:900 14px sans-serif;letter-spacing:.1em;text-align:center;animation:mpulse 1.1s infinite}
  #mexit:active{transform:translateX(-50%) scale(.96)}
  #mchat{position:fixed;z-index:26;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom,14px));width:min(420px,46vw);display:none;align-items:center;gap:9px;padding:6px 12px 6px 7px;background:rgba(4,20,13,.86);border:1px solid var(--c,#1d8a52);border-radius:30px;color:#eaffef;font:600 13px/1.25 sans-serif;pointer-events:none}
  #mchat.urgent{background:rgba(60,8,8,.92);border-color:#ff5a4a;color:#fff}
  #mchat img,#mchat canvas,#mchat .ph{flex:0 0 38px;width:38px;height:38px;border-radius:50%;border:2px solid var(--c,#39ff8a);object-fit:cover;background:#0b2a1c;display:flex;align-items:center;justify-content:center;font:800 15px sans-serif;color:#39ff8a}
  #mchat .who{font:800 9px sans-serif;letter-spacing:.14em;color:var(--c,#39ff8a);margin-bottom:1px}
  #mchat.urgent .t{font-weight:900;letter-spacing:.02em}
  @media (max-height:420px){#mrbhp{top:calc(max(6px,env(safe-area-inset-top,6px)) + 86px);width:140px}}
  `; document.head.appendChild(css);
  const hp=el('div','mrbhp',null,'<span>RUST BUCKET</span><b>100%</b><div class="bar"><i></i><u></u></div>');
  const exitB=el('button','mexit'); exitB.type='button'; exitB.textContent='\u{1F9B8} LEAP OUT & FIGHT!';
  const chat=el('div','mchat'); [hp,exitB,chat].forEach(e=>document.body.appendChild(e));
  ['touchstart','mousedown','pointerdown'].forEach(n=>exitB.addEventListener(n,e=>e.stopPropagation(),{passive:true}));
  exitB.addEventListener('click',()=>leapOut()); exitB.addEventListener('touchstart',e=>{ e.preventDefault(); leapOut(); },{passive:false});

  /* ---------- chase chatter: a small priority queue next to the story panel (never blocks driving) ---------- */
  const CH={cur:null,q:[],t:0,nextOk:0,cd:{},last:{}};
  let muted=true;
  function lineEl(l,urgent){
    chat.className=urgent?'urgent':''; const P=A.PEOPLE[l.who]; chat.style.setProperty('--c',urgent?'#ff7a6a':P.c); chat.innerHTML='';
    chat.appendChild(A.portraitEl(l.who,38)); const t=el('div'); t.innerHTML='<div class="who">'+P.n+'</div><div class="t"></div>'; t.lastChild.textContent=l.t; chat.appendChild(t); chat.style.display='flex';
  }
  function convo(key,variants,o){
    o=o||{}; if(muted||talking()) return false; const prio=o.prio||0;
    if(CH.cd[key]&&CH.cd[key]>clock) return false;
    if(prio<3&&(CH.cur||CH.q.length||clock<CH.nextOk)) return false;
    let i=Math.floor(Math.random()*variants.length); if(variants.length>1&&i===CH.last[key]) i=(i+1)%variants.length; CH.last[key]=i;
    const lines=variants[i];
    if(prio>=3){ CH.q.length=0; CH.cur=null; }
    CH.cd[key]=clock+(o.cd||10);
    lines.forEach((l,k)=>CH.q.push({who:l[0],t:l[1],prio,urgent:prio>=3&&k<2}));
    if(!CH.cur) nextLine(); return true;
  }
  function nextLine(){
    const l=CH.q.shift(); if(!l){ CH.cur=null; chat.style.display='none'; CH.nextOk=clock+rnd(2.4,3.6); return; }
    CH.cur=l; CH.t=l.prio>=3?1.15+l.t.length*.02:clamp(1.9+l.t.length*.04,2.2,4.2); lineEl(l,l.urgent);
  }
  function chatStep(dt){ if(CH.cur){ CH.t-=dt; if(CH.t<=0||talking()){ if(talking()){ CH.q.length=0; CH.cur=null; chat.style.display='none'; } else nextLine(); } } }
  function chatClear(){ CH.q.length=0; CH.cur=null; chat.style.display='none'; }

  const L={ // [[who, text], ...] variants
    chase:[ [['GWEN','Ben, drive faster! They\'re catching up!'],['BEN','I\'m trying! Maybe you should take the wheel!'],['GWEN','I would if you weren\'t sitting in the driver\'s seat!']],
      [['MAX','Both of you, focus! We\'ve got company!'],['BEN','You think?!']],
      [['GWEN','There are so many of them!'],['MAX','Keep the Rust Bucket moving, Ben!'],['BEN','Moving! I am always moving!']],
      [['MAX','Use the open roads, Ben. Don\'t box yourself in.'],['BEN','Great advice! Very calm! Thank you!']],
      [['GWEN','They\'re charging up again!'],['BEN','Then I will just not be where they are aiming!']],
      [['MAX','Whoever built these drones had a big budget.'],['GWEN','So a big budget AND a big grudge. Wonderful.']],
      [['BEN','Okay, who parked this many drones in the sky?!'],['GWEN','Less talking, more steering!']] ],
    slow:[ [['GWEN','Ben, could you go any slower?!'],['BEN','I\'m trying not to crash the Rust Bucket!']],
      [['MAX','Ben, this is not the time to cruise!'],['BEN','Cruising is a strong word!']],
      [['GWEN','We are sitting ducks out here!'],['BEN','Fine, fine! Flooring it!']] ],
    fast:[ [['MAX','Easy on the accelerator, Ben!'],['BEN','You told me to get us out of here!']],
      [['GWEN','Ben! Hold on, I am sliding off my seat!'],['BEN','You wanted faster!']] ],
    behind:[ [['GWEN','They\'re right behind us!'],['BEN','Then they should try keeping up!']],
      [['MAX','Drone on our tail, Ben!'],['BEN','I see it! I see it!']] ],
    above:[ [['GWEN','One\'s right above us!'],['BEN','Hold on to something!']],
      [['MAX','Overhead! They are lining up a shot!'],['BEN','Then I am changing lanes!']] ],
    hit:[ [['GWEN','We\'ve been hit!'],['MAX','Keep moving, Ben!']],
      [['MAX','The hull took that one!'],['BEN','Noted! Driving harder!']],
      [['GWEN','That one hurt the Rust Bucket!'],['BEN','It hurt me emotionally too!']] ],
    hull75:[ [['MAX','Hull is at three quarters, Ben. She is holding together.'],['BEN','Barely, I bet.']] ],
    hull60:[ [['GWEN','Ben! The Rust Bucket is starting to smoke!'],['BEN','She is a tough old bus. She can take it!']] ],
    crash:[ [['GWEN','BEN!'],['BEN','Okay, okay! I\'ve got it!'],['MAX','Try keeping your eyes on the road!']],
      [['MAX','BEN!'],['BEN','That wall came out of nowhere!'],['GWEN','It has been there for years!']] ],
    lookout:[ [['MAX','LOOK OUT!'],['GWEN','BEN, WATCH THE ROAD!'],['BEN','I SEE IT!']],
      [['GWEN','BEN, CAR AHEAD!'],['MAX','LOOK OUT!'],['BEN','I SEE IT!']] ],
    wall:[ [['MAX','BEN, THE WALL!'],['BEN','I SEE IT!']],
      [['GWEN','BUILDING! BUILDING!'],['BEN','I SEE THE BUILDING!']] ],
    near:[ [['MAX','That was close!'],['GWEN','Ben! You nearly got us killed!'],['BEN','But I didn\'t!'],['MAX','Eyes on the road, Ben!']],
      [['MAX','Nice driving!'],['BEN','I know!']],
      [['GWEN','Okay... that was way too close!'],['BEN','Close is still a miss!']] ]
  };

  /* ---------- state / persistence / savepoints ---------- */
  function load(j){ if(!j) return; const s=S; s.status=['offered','active','done'].includes(j.status)?j.status:'new'; s.obj=typeof j.obj==='number'?j.obj:-1; s.paused=!!j.paused; s.cp=j.cp||null; s.cp0=j.cp0||null; s.cpObj=s.obj; s.rb=j.rb||null; if(s.status==='active'&&(s.obj<0||s.obj>4)) s.obj=0; }
  function persist(){ return {status:S.status,obj:S.cpObj,paused:S.paused,cp:S.cp,cp0:S.cp0,rb:S.rb}; }
  function pose(rb){ return rb?{x:+rb.mesh.position.x.toFixed(2),z:+rb.mesh.position.z.toFixed(2),yaw:+rb.yaw.toFixed(3)}:null; }
  function beforeSave(){
    if(S.status==='active'&&[0,1,3,4].includes(S.obj)&&S.cpObj!==S.obj){
      S.cpObj=S.obj; try{ S.cp=G.snapshot(); S.cp.flying=false; S.cp.hp=1; S.cp.en=1; S.cp.rbp=pose(G.rbVeh())||S.rb||null; }catch(e){}
      if(S.obj===0||!S.cp0) S.cp0=S.cp;
      if(S.obj>0) setTimeout(()=>{ try{ toast('MISSION SAVEPOINT'); }catch(e){} },900); }
    if(S.status==='done'||S.status==='offered'||S.status==='new'){ S.cpObj=S.status==='done'?100:-1; }
  }

  /* ---------- the Rust Bucket ---------- */
  const rb=()=>G.rbVeh();
  const vel=p=>({x:-Math.sin(p.yaw)*p.v+p.push.x, z:-Math.cos(p.yaw)*p.v+p.push.z});
  function homePose(){ const r=G.rv(); return {x:r.x,z:r.z,yaw:r.yaw||0}; }
  const landOK=(x,z)=>{ const C=window.__CITY, b=C&&C.bounds; if(b&&(x<b[0]+10||x>b[2]-10||z<b[1]+10||z>b[3]-10)) return false; return G.terrH(x,z)>-.45; };   // stay inside the city grid, never in the water
  function landFix(ps){
    if(landOK(ps.x,ps.z)&&!G.blockedAt(ps.x,ps.z,gy(ps.x,ps.z)+.5)) return ps;
    for(let r=6;r<=200;r+=6) for(let k=0;k<20;k++){ const a=k/20*TAU, x=ps.x+Math.cos(a)*r, z=ps.z+Math.sin(a)*r;
      if(landOK(x,z)&&landOK(x+Math.cos(a)*7,z+Math.sin(a)*7)&&!G.blockedAt(x,z,gy(x,z)+.5)&&!G.carBlocked({yaw:ps.yaw,by:gy(x,z)},x,z)) return {x:+x.toFixed(2),z:+z.toFixed(2),yaw:ps.yaw}; }
    return ps;
  }
  function placeRB(ps,opts){
    ps=landFix(ps); if(S.rb&&(ps.x!==S.rb.x||ps.z!==S.rb.z)&&Math.hypot(ps.x-S.rb.x,ps.z-S.rb.z)<220&&(S.status==='done'||S.obj>=3)) S.rb=ps;
    const p=G.spawnRB(ps.x,ps.z,ps.yaw); if(!p) return null; opts=opts||{};
    p.mInv=!!opts.inv; p.locked=!!opts.lock; p.driver=null; return p;
  }
  function ensureRB(){
    if(!A.assetsReady()) return;
    let p=rb(); const inList=p&&G.props.indexOf(p)>=0;
    if(p&&inList&&!p.wreck){ wrecked=0; return; }
    if(S.status==='active'&&!S.paused&&[0,1,91,2].includes(S.obj)) return;            // a destroyed Rust Bucket is a mission failure there (handled in failCheck)
    if(p&&p.wreck){ wrecked+=1/60; if(wrecked<9) return; }
    const ps=(S.rb&&(S.status==='done'||(S.status==='active'&&S.obj>=3)))?S.rb:homePose();
    placeRB(ps); wrecked=0;
  }

  /* ---------- offer (after Mission 01) ---------- */
  const rbSpot=()=>{ const p=rb(); return p?{x:p.mesh.position.x,z:p.mesh.position.z}:homePose(); };
  function buildBeacon(){
    if(beacon) return; const sp=rbSpot(), y=gy(sp.x,sp.z), g=new THREE.Group(); g.position.set(sp.x,y,sp.z); g.userData.t=0;
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,34,14,1,true),new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending})); beam.position.y=17; g.add(beam);
    const ring=new THREE.Mesh(new THREE.RingGeometry(5,5.7,40),new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.y=.12; g.add(ring);
    scene.add(g); beacon=g;
  }
  function killBeacon(){ if(beacon){ scene.remove(beacon); beacon=null; } }
  const offered=()=>S.status==='offered';
  function offerNow(){
    S.status='offered'; S.obj=-1; A.save(); A.refreshHud();
    say([['MAX','Ben, I have been thinking about that relay. Something about it bothers me.'],['MAX','Meet us at the Rust Bucket. I want to move before anyone finds out where we are.'],['GWEN','And bring the evidence. I do not like leaving it lying around.']],()=>toast('NEW MISSION: MEET AT THE RUST BUCKET'));
  }
  function canStart(){ return offered()&&chargeT>=2; }
  function start(){
    if(!canStart()) return; S.status='active'; S.obj=0; started=true; killBeacon(); A.sb.style.display='none'; A.save(); A.refreshHud();
    say([['GWEN','Ben, the Rust Bucket scanners just lit up. Drones. Lots of drones!'],['MAX','They found us. Get behind the wheel, Ben, I will keep us alive!'],['BEN','Me? Drive? Grandpa, I am fourteen!'],['MAX','Then it will be a learning experience! Go!']],()=>toast('GET IN THE RUST BUCKET'));
    spawnFar(6);
  }

  /* ---------- drones ---------- */
  const D=[]; let idc=0, totalSpawned=0, chaseT=0, bolts=[];
  const cap=()=>Math.min((navigator.maxTouchPoints>0?8:11),5+Math.floor(chaseT/10));
  function flyY(x,z,alt){ return gy(x,z)+alt; }
  function mk(type,x,z,alt){ type='blade_drone';
    const en=G.spawnEnemy(type,x,z); if(!en) return null;
    en.mission=true; en.m2=true; en.stat='sky_drone'; en.mid='m2_'+(++idc); en.alertedT=1e6; en.hover=.75; en.ph=Math.random()*6;
    en.mesh.position.y=flyY(x,z,alt); return en;
  }
  function spawnFar(n){ const r=rbSpot(); for(let i=0;i<n;i++){ const a=rnd(0,TAU), d=rnd(70,95), en=mk('blade_drone',r.x+Math.cos(a)*d,r.z+Math.sin(a)*d,rnd(12,22)); if(en){ en.chase=true; en.farIdle=true; D.push(mkRec(en)); } } }
  function mkRec(en){ return {en,side:rnd(-9,9),back:rnd(7,20),up:rnd(5.5,12),cd:rnd(2.5,5.5),charge:0,climb:0,ph:Math.random()*6,type:en.type,burst:Math.random()<.35?2:1}; }
  function spawnChaseDrone(){
    const p=rb(); if(!p) return; const f=-Math.sin(p.yaw), fz=-Math.cos(p.yaw), a=rnd(-1.2,1.2), d=rnd(38,58);
    const bx=-f, bz=-fz, c=Math.cos(a), s=Math.sin(a), dx=bx*c-bz*s, dz=bx*s+bz*c;
    const en=mk('blade_drone',p.mesh.position.x+dx*d,p.mesh.position.z+dz*d,rnd(9,16)); if(!en) return; en.chase=true; D.push(mkRec(en)); totalSpawned++;
  }
  function dropDrone(r,remove){ const i=D.indexOf(r); if(i>=0) D.splice(i,1); if(remove){ const k=enemies.indexOf(r.en); if(k>=0){ enemies.splice(k,1); } try{ scene.remove(r.en.mesh); }catch(e){} r.en.alive=false; } }
  const flash=(en,on)=>{ try{ for(const m of en.parts.all){ if(on){ m.emissive.setHex(0xff6a1a); } else m.emissive.setHex(m.userData&&m.userData.baseEmis||0); } }catch(e){} };

  /* energy orbs (the only attack in the chase) */
  const orbGeo=new THREE.SphereGeometry(.4,8,6), haloGeo=new THREE.SphereGeometry(.78,8,6);
  function orb(color){ const g=new THREE.Group(); g.add(new THREE.Mesh(orbGeo,new THREE.MeshBasicMaterial({color:0xffffff}))); g.add(new THREE.Mesh(haloGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}))); g.visible=false; scene.add(g); return g; }
  function fire(r,p){
    const e=r.en.mesh.position, laser=r.burst>1, n=r.burst, col=laser?0x44ffd0:0xff8a2a, sp=laser?27:24;
    const vp=vel(p), dist=Math.hypot(p.mesh.position.x-e.x,p.mesh.position.z-e.z);
    for(let k=0;k<n;k++){
      if(bolts.filter(b=>b.on).length>=26) return; let b=bolts.find(q=>!q.on&&q.col===col); if(!b){ b={g:orb(col),col,on:false,v:new THREE.Vector3()}; bolts.push(b); }
      const t=Math.hypot(dist,e.y-p.mesh.position.y)/sp, lead=.85*t, spread=(.9+dist*.035)*(laser?1.15:1);
      const tx=p.mesh.position.x+vp.x*lead+rnd(-spread,spread), tz=p.mesh.position.z+vp.z*lead+rnd(-spread,spread), ty=p.mesh.position.y+rnd(-.2,1.2);
      b.g.position.set(e.x,e.y,e.z); b.v.set(tx-e.x,ty-e.y,tz-e.z).normalize().multiplyScalar(sp); b.on=true; b.life=5; b.dmg=laser?8:13; b.g.visible=true; b.g.scale.setScalar(laser?.8:1.1);
      if(n>1) b.g.position.addScaledVector(b.v,-k*.014*sp*0.4);
    }
    try{ Audio_.blast&&Audio_.blast(.25); }catch(e2){}
  }
  function orbsStep(dt){
    const p=rb();
    for(const b of bolts){ if(!b.on) continue; const g=b.g.position; b.life-=dt; g.addScaledVector(b.v,dt); let end=b.life<=0;
      if(!end&&p){ const dx=g.x-p.mesh.position.x, dz=g.z-p.mesh.position.z; if(dx*dx+dz*dz<30){ const fx=-Math.sin(p.yaw), fz=-Math.cos(p.yaw), a=dx*fx+dz*fz;
          const lat=dx*Math.cos(p.yaw)-dz*Math.sin(p.yaw); if(Math.abs(a)<p.hl+.5&&Math.abs(lat)<p.hw+.6&&g.y>p.by-.2&&g.y<p.by+4.6){ end=true; hitRB(b,p); } } }
      if(!end&&(g.y<gy(g.x,g.z)||G.blockedAt(g.x,g.z,g.y-.3))){ end=true; VFX.sparks(new THREE.Vector3(g.x,g.y,g.z),5,3,0xffb050,.2,.3); }
      if(!end&&p&&Math.hypot(g.x-p.mesh.position.x,g.z-p.mesh.position.z)>130) end=true;
      if(end){ b.on=false; b.g.visible=false; }
    }
  }
  function hitRB(b,p){
    VFX.sparks(new THREE.Vector3(b.g.position.x,b.g.position.y,b.g.position.z),12,6,b.col,.25,.45); try{ Audio_.heavyHit&&Audio_.heavyHit(); }catch(e){}
    G.shake(.22); hitFx=.25; G.damageVehicle(p,b.dmg,'bolt'); onHit();
  }
  let hitFx=0, lastHit=-99;
  function onHit(){ lastHit=clock; if(S.obj===1&&!S.trig){ convo('hit',L.hit,{prio:2,cd:7}); } }

  function droneStep(dt){
    const p=rb(); if(!p) return; const pm=p.mesh.position, fx=-Math.sin(p.yaw), fz=-Math.cos(p.yaw), rx=Math.cos(p.yaw), rz=-Math.sin(p.yaw), vp=vel(p);
    const chaseOn=S.obj===1||S.obj===91||S.obj===2;
    for(let i=D.length-1;i>=0;i--){ const r=D[i], en=r.en;
      if(!en.alive||enemies.indexOf(en)<0){ D.splice(i,1); continue; }
      const m=en.mesh.position;
      if(!en.chase) continue;
      r.ph+=dt;
      const far=Math.hypot(m.x-pm.x,m.z-pm.z);
      if(far>125&&chaseOn&&!r.farIdle){ dropDrone(r,true); continue; }
      let tx,tz,ty,sp;
      if(r.farIdle&&S.obj===0){ tx=pm.x+Math.cos(r.ph*.3+i)*60; tz=pm.z+Math.sin(r.ph*.3+i)*60; ty=pm.y+14; sp=7; }                 // circling in the distance before the chase
      else { r.farIdle=false;
        tx=pm.x-fx*r.back+rx*(r.side+Math.sin(r.ph*.9)*2.5)+vp.x*.35; tz=pm.z-fz*r.back+rz*(r.side+Math.sin(r.ph*.9)*2.5)+vp.z*.35; ty=gy(tx,tz)+r.up+r.climb+Math.sin(r.ph*1.3)*.8; sp=clamp(Math.hypot(tx-m.x,tz-m.z)*2.4,0,30); }
      const dx=tx-m.x, dz=tz-m.z, dl=Math.hypot(dx,dz)||1, step=Math.min(dl,sp*dt); let nx=m.x+dx/dl*step, nz=m.z+dz/dl*step;
      const blocked=G.blockedAt(nx,nz,m.y-1);
      if(blocked){ r.climb=Math.min(60,r.climb+18*dt); if(!G.blockedAt(nx,m.z,m.y-1)) m.x=nx; else if(!G.blockedAt(m.x,nz,m.y-1)) m.z=nz; }
      else { r.climb=Math.max(0,r.climb-5*dt); m.x=nx; m.z=nz; }
      m.y+=(ty-m.y)*Math.min(1,dt*3.2); if(m.y<gy(m.x,m.z)+2.5) m.y=gy(m.x,m.z)+2.5;
      en.mesh.lookAt(pm.x,m.y,pm.z);
      // attacks
      if(chaseOn&&!r.farIdle&&S.obj===1&&!S.trig&&G.driving()===p){
        const ramp=1-Math.min(.32,chaseT/220);
        if(r.charge>0){ r.charge-=dt; if(r.charge<=0){ flash(en,false); fire(r,p); r.cd=rnd(3.2,5.2)*ramp; } }
        else { r.cd-=dt; if(r.cd<=0&&far<46&&far>7){ r.charge=.45; flash(en,true); } }
      }
    }
  }
  function nearestDrone(){ const p=rb(); if(!p) return null; let best=null,bd=1e9; for(const r of D){ if(!r.en.alive||r.farIdle) continue; const d=Math.hypot(r.en.mesh.position.x-p.mesh.position.x,r.en.mesh.position.z-p.mesh.position.z); if(d<bd){ bd=d; best=r; } } return best?{r:best,d:bd}:null; }

  /* ---------- the chase: dynamic dialogue from real events ---------- */
  const W=[]; let slowT=0, fastT=0, hull75=false, hull60=false, closeCd=0;
  function qpos(q){ return q.mesh.position; }
  function dynStep(dt){
    const p=rb(); if(!p||G.driving()!==p||S.trig) return; const pm=p.mesh.position, vp=vel(p), spd=Math.abs(p.v), top=17;
    const hpf=p.hp/p.hpMax; if(!hull75&&hpf<=.75){ hull75=true; convo('h75',L.hull75,{prio:2,cd:30}); } if(!hull60&&hpf<=.6){ hull60=true; convo('h60',L.hull60,{prio:2,cd:30}); }
    // slow / fast driving
    slowT=(spd<4&&chaseT>9)?slowT+dt:Math.max(0,slowT-dt*2); fastT=(spd>top*.9)?fastT+dt:Math.max(0,fastT-dt*2);
    if(slowT>4.5){ if(convo('slow',L.slow,{prio:1,cd:35})) slowT=0; } if(fastT>4){ if(convo('fast',L.fast,{prio:1,cd:55})) fastT=0; }
    // drones close
    closeCd-=dt; const nd=nearestDrone(); if(nd&&nd.d<13&&closeCd<=0){ const e=nd.r.en.mesh.position, bx=e.x-pm.x, bz=e.z-pm.z, ahead=bx*(-Math.sin(p.yaw))+bz*(-Math.cos(p.yaw)), up=e.y-pm.y>5&&nd.d<10;
      if(convo(up?'above':'behind',up?L.above:L.behind,{prio:1,cd:25})) closeCd=6; }
    // traffic / blocking vehicles: warn only when a collision is actually about to happen
    for(const q of G.props){ if(!q.veh||q===p||q.wreck||q.flipped) continue; const qp=qpos(q), rx=qp.x-pm.x, rz=qp.z-pm.z, d2=rx*rx+rz*rz; if(d2>34*34) continue;
      const qv=vel(q), vx=qv.x-vp.x, vz=qv.z-vp.z, vv=vx*vx+vz*vz; let tc=0, md=Math.sqrt(d2);
      if(vv>.5){ tc=-(rx*vx+rz*vz)/vv; if(tc>0){ md=Math.hypot(rx+vx*tc,rz+vz*tc); } else tc=0; }
      let w=W.find(o=>o.q===q);
      if(!w&&tc>0&&tc<1.25&&md<3.9&&Math.sqrt(d2)<26){ W.push(w={q,t0:clock,minD:1e9,crashed:false,warned:true}); convo('lookout',L.lookout,{prio:4,cd:3}); }
    }
    for(let i=W.length-1;i>=0;i--){ const w=W[i], d=Math.hypot(qpos(w.q).x-pm.x,qpos(w.q).z-pm.z); w.minD=Math.min(w.minD,d);
      if(clock-w.t0>3.6||(d>w.minD+2.5&&d>8)||G.props.indexOf(w.q)<0){ W.splice(i,1); if(!w.crashed&&w.minD>3.3&&w.minD<8&&clock-crashAt>2.5){ convo('near',L.near,{prio:2,cd:12}); } } }
    // buildings / barriers straight ahead at speed
    if(spd>10&&Math.abs(p.steer)<.55){ const s=clamp(spd*.8+3,6,20), px=pm.x+vp.x/Math.max(spd,.1)*s, pz=pm.z+vp.z/Math.max(spd,.1)*s;
      if(G.blockedAt(px,pz,p.by+.6)&&G.blockedAt(pm.x+vp.x/spd*s*.6,pm.z+vp.z/spd*s*.6,p.by+.6)){ convo('wall',L.wall,{prio:4,cd:4.5}); } }
    // idle banter
    if(chaseT>6) convo('chase',L.chase,{prio:0,cd:rnd(15,24)});
  }
  let crashAt=-99;
  function rvEvent(kind,speed){
    if(kind!=='crash'||S.obj!==1||S.trig) return; crashAt=clock; for(const w of W) w.crashed=true;
    convo('crash',L.crash,{prio:3,cd:5});
  }
  function rvGuard(p,dmg){ if(S.status==='active'&&S.obj===1&&!S.trig) return Math.min(dmg,Math.max(0,p.hp-p.hpMax*.40)); return dmg; }
  const lockExit=()=>S.status==='active'&&!S.paused&&(S.obj===1||S.obj===91);

  /* ---------- the 47% story beat, exit, scripted departure ---------- */
  function trigger(){
    S.trig=true; const p=rb(); p.mInv=true; muted=true; chatClear(); S.obj=91; A.refreshHud();
    toast('GRANDPA MAX: GET OUT THERE, BEN!');
    say([['MAX','Ben! We can\'t keep taking hits like this!'],['GWEN','There are too many of them!'],['MAX','Ben, get out there and clear them off!'],['BEN','You want me to fight THAT many drones?!'],['MAX','Unless you have a better idea!'],['BEN','Right. Terrible idea. Let\'s do it!']],()=>{
      S.obj=2; A.refreshHud(); });
  }
  function leapOut(){ if(S.obj!==2||G.driving()!==rb()) return; G.exitCar(); }
  let dep=null;
  function beginFight(fromRestore){
    const p=rb(); if(!p) return; p.mInv=true; p.locked=true; p.driver='script'; if(!fromRestore){ /* keep current speed */ } else p.v=13;
    dep={dist:0,t:0,stuck:0}; exitB.style.display='none';
    // surviving chase drones turn on Ben; the waves top them up
    waveEns.length=0; for(const r of D.slice()){ if(r.en.alive&&enemies.indexOf(r.en)>=0){ r.en.chase=false; r.en.hover=.75; r.en.stat='sky_drone'; r.en.alertedT=1e6; waveEns.push(r.en); } D.length=0; }
    S.obj=3; wave=0; waveT=1.5; A.save(); A.refreshHud(); chatClear(); muted=false;
    say([['GWEN','The Rust Bucket is pulling out! Ben, you have got their attention now!'],['BEN','That is what I was afraid of. Time to go hero!']]);
  }
  function driveAway(dt){
    const p=rb(); if(!p||!dep) return; const m=p.mesh.position; dep.t+=dt;
    const fr=(a,d)=>{ const x=m.x-Math.sin(p.yaw+a)*d, z=m.z-Math.cos(p.yaw+a)*d; return landOK(x,z)&&!G.carBlocked(p,x,z); };
    let steer=0; const opts=[0,.3,-.3,.6,-.6,.95,-.95,1.35,-1.35];
    for(const a of opts){ if(fr(a,6)&&fr(a,13)){ steer=a; break; } }
    p.yaw+=clamp(steer,-1,1)*dt*1.5; p.mesh.rotation.y=p.yaw;
    p.v+=(15-p.v)*Math.min(1,dt*1.3); const x0=m.x, z0=m.z; G.moveCar(p,dt); dep.dist+=Math.hypot(m.x-x0,m.z-z0);
    if(Math.abs(p.v)<1.2) dep.stuck+=dt; else dep.stuck=0; if(dep.stuck>2.4){ p.yaw+=1.7; dep.stuck=0; p.v=3; }
    const pd=Math.hypot(m.x-player.pos.x,m.z-player.pos.z);
    if(dep.dist>240||dep.t>40||(dep.dist>160&&pd>190)){ p.v=0; p.driver=null; if(!landOK(m.x,m.z)){ const f=landFix({x:m.x,z:m.z,yaw:p.yaw}); m.x=f.x; m.z=f.z; } S.rb=pose(p); dep=null; A.save(); }
  }

  /* ---------- drone waves ---------- */
  const WN=[6,8,10]; let wave=0, waveT=0, waveEns=[], leashT=0, objTextN=-1;
  function spawnWaveDrone(){
    const a=rnd(0,TAU), d=rnd(28,42), x=player.pos.x+Math.cos(a)*d, z=player.pos.z+Math.sin(a)*d, en=mk('blade_drone',x,z,rnd(7,13)); if(en){ waveEns.push(en); } return en;
  }
  function wavesStep(dt){
    if(waveT>0){ waveT-=dt; if(waveT<=0){ wave++; const n=WN[wave-1]; toast('WAVE '+wave+' OF '+WN.length); while(waveEns.filter(e=>e.alive).length<n) spawnWaveDrone(); A.refreshHud(); } return; }
    if(wave===0) return;
    const alive=waveEns.filter(e=>e.alive&&enemies.indexOf(e)>=0), lost=waveEns.filter(e=>e.alive&&enemies.indexOf(e)<0).length;
    for(let i=0;i<lost;i++) spawnWaveDrone();
    for(let i=waveEns.length-1;i>=0;i--) if(!waveEns[i].alive||enemies.indexOf(waveEns[i])<0) waveEns.splice(i,1);
    if(objTextN!==waveEns.length){ objTextN=waveEns.length; A.refreshHud(); }
    // no escaping: stragglers far away are brought back around Ben
    leashT-=dt; if(leashT<=0){ leashT=2; let far=false; for(const e of waveEns){ const d=Math.hypot(e.mesh.position.x-player.pos.x,e.mesh.position.z-player.pos.z); if(d>110){ far=true; const a=rnd(0,TAU); e.mesh.position.set(player.pos.x+Math.cos(a)*38,player.pos.y+rnd(7,12),player.pos.z+Math.sin(a)*38); } } if(far) convo('nr',[[['GWEN','Ben, they are still coming for you! Don\'t run!']]],{prio:1,cd:20}); }
    if(waveEns.length===0){
      if(wave<WN.length){ waveT=2.6; toast('WAVE '+wave+' CLEARED'); convo('wv'+wave,[[['MAX','Good! Keep it up, Ben!']],[['BEN','Is that all you\'ve got?!']]],{prio:1,cd:2}); }
      else finishFight();
    }
  }
  function finishFight(){
    const p=rb(); if(p){ p.locked=false; p.mInv=false; } S.obj=4; wave=0; A.save(); A.refreshHud();
    const t=S.rb||pose(p)||homePose(), dx=t.x-player.pos.x, dz=t.z-player.pos.z, ang=Math.atan2(-dz,dx), names=['east','north-east','north','north-west','west','south-west','south','south-east'], dir=names[(Math.round(ang/(Math.PI/4))+8)%8], m=Math.round(Math.hypot(dx,dz)*.73);
    say([['MAX','Ben! That was incredible. They are all down.'],['GWEN','We could not turn back for you, the Rust Bucket was too damaged. We pulled over to stay hidden.'],['MAX','We are about '+m+' meters to the '+dir+'. I have marked it on your map. Come find us.'],['BEN','On my way. Keep the engine warm!']],()=>toast('FIND THE RUST BUCKET'));
  }

  /* ---------- evidence scene + completion ---------- */
  function arrive(){
    S.obj=95; A.refreshHud(); const ev=A.evidence(), N={signal:'the signal log from the drone wreck',psyphon:'the decoded Psyphon transmission'}, list=ev.map(k=>N[k]).filter(Boolean);
    const what=list.length?list.join(' and '):'everything we collected';
    say([['GWEN','Ben! Thank goodness. We have a problem.'],['MAX','The lockbox is open. '+what.charAt(0).toUpperCase()+what.slice(1)+' is gone.'],['BEN','Gone? We were gone for ten minutes! I was fighting drones the whole time!'],['GWEN','That was the point. The attack was a distraction.'],['MAX','While you were out there, Psyphon\'s people took everything back. He was one step ahead of us the entire time.'],['BEN','Fine. Next time, I will be one step ahead of him.']],()=>complete());
  }
  function complete(){
    S.status='done'; S.obj=100; S.paused=false; A.save(); A.refreshHud(); const p=rb(); if(p){ p.locked=false; p.mInv=false; S.rb=S.rb||pose(p); A.save(); }
    A.showDone('<h3>MISSION 02 • GHOST IN THE MACHINE</h3><h2>NOT OVER YET!</h2><ul><li>Survived the drone chase</li><li>Drone swarm destroyed</li><li class="bad">Evidence stolen by Psyphon</li><li>Psyphon is one step ahead</li></ul><button type="button">BACK TO THE ADVENTURE ▶</button>');
  }

  /* ---------- objective text, cleanup, restore ---------- */
  function owns(){ return S.status==='offered'||S.status==='active'; }
  function objective(){
    if(S.status==='offered'){ const r=rbSpot(); return {title:'GRANDPA MAX',t:'Meet Grandpa Max at the Rust Bucket',mk:{x:r.x,z:r.z,label:'RUST BUCKET'}}; }
    if(S.status!=='active') return null; const p=rb();
    switch(S.obj){
      case 0: { const r=rbSpot(); return {title:TITLE,t:'Get in the Rust Bucket',mk:{x:r.x,z:r.z,label:'RUST BUCKET'}}; }
      case 1: return {title:TITLE,t:'DRIVE! Keep the Rust Bucket alive',mk:null};
      case 91: return {title:TITLE,t:'Hang on...',mk:null};
      case 2: return {title:TITLE,t:'Leap out and clear the drones',mk:null};
      case 3: return {title:TITLE,t:wave===0?'Get ready...':'Destroy the drones ('+waveEns.filter(e=>e.alive).length+' left, wave '+wave+'/'+WN.length+')',mk:nearestEnemyMk()};
      case 4: { const t=S.rb||pose(p)||homePose(); return {title:TITLE,t:'Find the Rust Bucket',mk:{x:t.x,z:t.z,label:'RUST BUCKET'}}; }
      case 95: return {title:TITLE,t:'Check the Rust Bucket',mk:null};
    } return null;
  }
  function nearestEnemyMk(){ let b=null,bd=1e9; for(const e of waveEns){ if(!e.alive) continue; const d=Math.hypot(e.mesh.position.x-player.pos.x,e.mesh.position.z-player.pos.z); if(d<bd){ bd=d; b=e; } } return b&&bd>40?{x:b.mesh.position.x,z:b.mesh.position.z,label:'DRONES'}:null; }
  function cleanup(){
    for(const r of D.slice()) dropDrone(r,true); D.length=0;
    for(const e of enemies.slice()){ if(e.m2){ const k=enemies.indexOf(e); if(k>=0) enemies.splice(k,1); try{ scene.remove(e.mesh); }catch(x){} e.alive=false; } }
    waveEns.length=0; for(const b of bolts){ b.on=false; b.g.visible=false; } W.length=0; chatClear(); muted=true; hp.style.display='none'; exitB.style.display='none'; killBeacon();
    dep=null; wave=0; waveT=0; S.trig=false; chaseT=0; hull75=hull60=false; slowT=fastT=0; totalSpawned=0;
    const p=rb(); if(p){ p.mInv=false; p.locked=false; if(p.driver==='script') p.driver=null; }
  }
  function setup(obj,snap){
    S.obj=obj; S.trig=false; S.status='active'; S.paused=false;
    const rp=(snap&&snap.rbp)||(obj>=3&&S.rb)||homePose();
    if(obj===0){ placeRB(homePose()); spawnFar(6); }
    else if(obj===1){ const p=placeRB(rp); if(p&&A.assetsReady()){ G.enterCar(p); } begin1(); }
    else if(obj===3){ const p=placeRB(rp,{inv:true,lock:true}); if(p){ p.driver='script'; beginFight(true); } }
    else if(obj===4){ placeRB(S.rb||rp); S.obj=4; }
    A.save(); A.refreshHud();
  }
  function restart(which){          // 'start' (very first savepoint of the mission) or 'cp' (last savepoint)
    cleanup(); const snap=which==='start'?(S.cp0||S.cp):S.cp, obj=which==='start'?0:(S.cpObj>=0?S.cpObj:0);
    if(which==='start'){ S.cp=S.cp0||S.cp; S.cpObj=0; } G.revive(snap?snap.x:.5,snap?snap.z:.5); if(snap) G.applySnap(snap,true);
    setup(obj,snap);
  }
  function pauseAndExit(){ cleanup(); S.paused=true; A.save(); const snap=S.cp; G.revive(snap?snap.x:.5,snap?snap.z:.5); if(snap) G.applySnap(snap,true); ensureRB(); A.refreshHud(); }
  function resumeFromPause(){ S.paused=false; restart('cp'); toast('MISSION RESUMED'); }
  function begin1(){ chaseT=0; S.trig=false; muted=false; hull75=hull60=false; slowT=fastT=0; D.length=0; hp.style.display='block'; A.refreshHud();
    for(let i=0;i<4;i++) spawnChaseDrone();
    setTimeout(()=>{ convo('chase',[[['GWEN','Here they come! Ben, drive!'],['BEN','Where to?! Anywhere! Got it!'],['MAX','Stay on the move, Ben. They cannot hit what they cannot catch!']]],{prio:2,cd:20}); },1400); }

  /* ---------- per-frame ---------- */
  let started=false, firstT=0;
  function failCheck(){
    if(S.status!=='active'||S.paused||![0,1,91,2].includes(S.obj)) return; const p=rb();
    if(S.obj>=0&&(!p||p.wreck||G.props.indexOf(p)<0)){ wrecked++; if(wrecked>=1){ wrecked=0; A.fail('THE RUST BUCKET WAS DESTROYED'); } }
  }
  function tick(dt){ clock+=dt; ensureRB(); chatStep(dt); }
  function step(dt){
    if(S.status==='new'){ A.sb.style.display='none'; if(A.m01Done()&&!A.doneOpen()&&!talking()){ offerWait+=dt; if(offerWait>4) offerNow(); } return; }
    if(S.status==='offered'){
      const r=rbSpot(), d=Math.hypot(player.pos.x-r.x,player.pos.z-r.z); buildBeacon();
      if(d<16){ chargeT=Math.min(2,chargeT+dt); } else chargeT=Math.max(0,chargeT-dt*2); const near=d<16, ready=chargeT>=2, sb=A.sb;
      if(near){ sb.style.display='block'; sb.disabled=!ready; sb.className=ready?'ready':''; sb.style.setProperty('--p',(chargeT/2*100).toFixed(0)+'%'); const t=ready?'▶ HOP IN, BEN!':'WARMING UP THE ENGINE '+Math.floor(chargeT/2*100)+'%'; if(sb.textContent!==t) sb.textContent=t; } else sb.style.display='none';
      if(beacon){ beacon.userData.t+=dt; beacon.rotation.y+=dt*.8; }
      A.placeWay(); A.btn.style.display='none'; return;
    }
    if(S.status!=='active'){ hp.style.display='none'; exitB.style.display='none'; return; }
    A.sb.style.display='none';
    if(!started){ started=true; if(!S.paused&&S.obj>=0) setup(S.obj,S.cp); }       // first frame after a reload: rebuild the scene of the saved objective
    if(S.paused){ hp.style.display='none'; exitB.style.display='none'; A.btn.style.display='none'; A.way.style.display='none'; return; }
    const p=rb();
    failCheck();
    if(S.obj===0){ droneStep(dt); orbsStep(dt); if(p&&G.driving()===p){ S.obj=1; A.save(); A.refreshHud(); begin1(); } }
    else if(S.obj===1||S.obj===91||S.obj===2){
      chaseT+=dt; droneStep(dt); orbsStep(dt); dynStep(dt);
      if(p){ const f=clamp(p.hp/p.hpMax,0,1); hp.style.display='block'; hp.firstChild.nextSibling.textContent=Math.round(f*100)+'%'; hp.querySelector('i').style.width=(f*100)+'%'; hp.className=f<.55?'low':''; }
      if(S.obj===1&&!S.trig&&p&&G.driving()===p){
        const need=cap(); if(D.length<need&&Math.random()<dt*1.4) spawnChaseDrone();
        if(p.hp<=p.hpMax*.47+.01) trigger();
      }
      exitB.style.display=(S.obj===2&&G.driving()===p&&!talking())?'block':'none';
      if(S.obj===2&&!G.driving()&&p){ beginFight(false); }
      if(S.obj===91&&!G.driving()&&p&&!talking()){ beginFight(false); }
    }
    else if(S.obj===3){ hp.style.display='none'; if(dep) driveAway(dt); orbsStep(dt); wavesStep(dt); }
    else if(S.obj===4){ hp.style.display='none'; const t=S.rb||pose(p); if(t&&!talking()){ const d=Math.hypot(player.pos.x-t.x,player.pos.z-t.z); if(d<11&&Math.abs(player.pos.y-gy(t.x,t.z))<8) arrive(); } }
    if(hitFx>0){ hitFx-=dt; }
    A.placeWay();
    A.btn.style.display='none';
  }

  /* ---------- reset hooks used by the fail menu / pause banner ---------- */
  const api={ S, load, persist, beforeSave, tick, step, objective, owns, offered, canStart, start, restart, pauseAndExit, resumeFromPause, rvEvent, rvGuard, lockExit, cleanup,
    active:()=>S.status==='active'&&!S.paused, obj:()=>S.obj, paused:()=>S.paused,
    dbg:{ quickStart(){ chargeT=2; start(); }, get D(){ return D; }, get bolts(){ return bolts; }, trigger, spawnChaseDrone, setup, get chaseT(){ return chaseT; }, offerNow, get wave(){ return wave; }, get waveEns(){ return waveEns; }, set muted(v){ muted=v; } } };
  return api;
};
})();
