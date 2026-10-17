/* =====================================================================================
   MISSIONS - modular mission engine + Mission 01 "UNWANTED VISITORS".
   game.html calls  window.MissionSystem(G)  once, handing over the pieces of the game it needs (G).
   Everything mission-related lives here: save/restore, objective tracker, world marker, minimap / map marker,
   in-world interactables, the story dialogue panel, the "CHILL SMALL" prompt, the completion screen and the
   enemy encounters. A new mission = one more definition object next to M01 (see the bottom of this file).
   Enemies are real world enemies (makeEnemy); the drones are the uploaded GLB models.
===================================================================================== */
(function(){
const KEY='omniverse_missions_v1';
const b2b=s=>{ const bin=atob(s), n=bin.length, u=new Uint8Array(n); for(let i=0;i<n;i++) u[i]=bin.charCodeAt(i); return u.buffer; };

/* ---------- model assets (blade drone, Psyphon, E-11 blaster) are parsed once, then cloned ---------- */
const MA=window.MissionAssets={ blade:null, psyphon:null, gun:null, bladeAnims:[], ready:false, T:null,
  async load(THREE){
    this.T=THREE; const D=window.__GLB_DATA||{};
    const parse=key=>new Promise(res=>{ if(!D[key]){ res(null); return; } try{ new THREE.GLTFLoader().parse(b2b(D[key]),'',g=>{ delete D[key]; res(g); },()=>{ delete D[key]; res(null); }); }catch(e){ res(null); } });
    const [b,p,g]=await Promise.all([parse('blade_drone'),parse('psyphon'),parse('e11_blaster')]);
    if(b){ this.blade=b.scene; this.bladeAnims=b.animations||[]; }
    if(p) this.psyphon=p.scene; if(g) this.gun=g.scene; this.ready=true;
  },
  // Lambert copies of the GLB materials (per instance so the hit-flash does not leak between drones)
  mats(inst,list,skinning){ const THREE=this.T, cache=new Map();
    inst.traverse(o=>{ if(!o.isMesh) return; o.frustumCulled=false; o.castShadow=true; const src=o.material; let m=cache.get(src);
      if(!m){ if(src.map) src.map.encoding=THREE.LinearEncoding;
        m=new THREE.MeshLambertMaterial({color:src.color?src.color.clone():new THREE.Color(0xffffff),map:src.map||null,emissive:src.emissive?src.emissive.clone():new THREE.Color(0),emissiveMap:src.emissiveMap||null,side:src.side,transparent:src.transparent,opacity:src.opacity,alphaTest:src.alphaTest,skinning:!!o.isSkinnedMesh});
        m.userData.baseEmis=m.emissive.getHex(); cache.set(src,m); if(list) list.push(m); }
      o.material=m; }); },
  decorate(en,type){
    const THREE=this.T; if(!THREE||!this.ready) return;
    if(type==='blade_drone'&&this.blade){
      en.spin.visible=false;                                     // the mannequin rig stays (AI/animation code references it) but is hidden
      const inst=THREE.SkeletonUtils.clone(this.blade), pivot=new THREE.Group(); pivot.add(inst);
      pivot.scale.setScalar(.055); pivot.rotation.y=Math.PI;     // model faces +Z, the enemy group is aimed with lookAt (+Z) already -> keep as is
      pivot.rotation.y=0; this.mats(inst,en.parts.all,true); en.mesh.add(pivot); en.model=pivot;
      if(this.bladeAnims.length){ en.mixer=new THREE.AnimationMixer(inst); this.bladeAnims.forEach(c=>{ try{ en.mixer.clipAction(c).play(); }catch(e){} }); }
      en.hover=.75; en.ph=Math.random()*6; en.drone=true; pivot.position.y=-.05;
    } else if(type==='laser_drone'){
      en.drone=true;
      const G=en.parts.glb; if(!G||!this.gun) return;
      const hand=G.bones.find(b=>/R_Hand/.test(b.name)); if(!hand) return;
      const gun=THREE.SkeletonUtils.clone(this.gun); this.mats(gun,en.parts.all,false);
      const h=new THREE.Group(); h.add(gun); gun.rotation.set(0,Math.PI/2,0); gun.scale.setScalar(.05); h.position.set(0,2,0); hand.add(h); en.gun=h;
    }
  },
  droneDie(en){
    const THREE=this.T, p=en.mesh.position.clone(); if(window.__missionG){ const V=window.__missionG.VFX; try{ V.flip('star_explosion',p,{size:2.4,dur:.45,tint:0xffb050}); V.sparks(p,18,8,0xffd070,.3,.6); window.__missionG.Audio_.blast&&window.__missionG.Audio_.blast(.8); }catch(e){} }
    en.mesh.visible=false; setTimeout(()=>{ try{ en.mesh.parent&&en.mesh.parent.remove(en.mesh); if(en.mixer) en.mixer.stopAllAction(); }catch(e){} },60);
    const i=window.__missionG&&window.__missionG.enemies.indexOf(en); if(i>=0) window.__missionG.enemies.splice(i,1);
  }
};

window.MissionSystem=function(G){
  const {THREE,scene,camera,player,enemies,VFX,Audio_}=G; window.__missionG=G;
  MA.load(THREE).catch(e=>console.warn('mission assets',e));
  const el=(t,id,cls,html)=>{ const e=document.createElement(t); if(id) e.id=id; if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; };

  /* ---------- styles + HUD ---------- */
  const css=document.createElement('style'); css.textContent=`
  #mtrack{position:fixed;z-index:26;left:50%;transform:translateX(-50%);top:calc(max(8px,env(safe-area-inset-top,8px)) + 58px);display:none;max-width:min(360px,56vw);padding:6px 12px 7px;background:rgba(4,20,13,.82);border:1px solid #1d8a52;border-left:3px solid #ffd24a;color:#e8fff1;font:600 12px/1.25 sans-serif;pointer-events:none;text-align:left}
  #mtrack b{display:block;color:#ffd24a;font-size:10px;letter-spacing:.14em;margin-bottom:1px}
  #mtrack.paused{border-left-color:#7a8a80;pointer-events:auto;cursor:pointer}
  #mtrack.paused b{color:#9fb5a8}
  #mtoast{position:fixed;z-index:29;left:50%;transform:translateX(-50%);top:calc(max(8px,env(safe-area-inset-top,8px)) + 112px);padding:6px 16px;background:rgba(4,20,13,.9);border:1px solid #ffd24a;color:#ffe58a;font:800 11px sans-serif;letter-spacing:.14em;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
  #mway{position:fixed;z-index:25;left:0;top:0;width:0;height:0;display:none;pointer-events:none}
  #mway i{position:absolute;left:-9px;top:-9px;width:18px;height:18px;background:#ffd24a;transform:rotate(45deg);box-shadow:0 0 10px #ffd24a,0 0 3px #000;border:2px solid #3a2c00}
  #mway span{position:absolute;left:-50px;top:12px;width:100px;text-align:center;color:#ffe58a;font:700 11px sans-serif;text-shadow:0 0 4px #000,0 0 2px #000}
  #mdlg{position:fixed;z-index:27;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom,14px));width:min(520px,62vw);display:none;align-items:flex-start;gap:10px;padding:8px 12px;background:rgba(4,20,13,.9);border:1px solid #1d8a52;color:#e8fff1;font:500 13px/1.35 sans-serif;cursor:pointer}
  #mdlg canvas,#mdlg .ph{flex:0 0 46px;width:46px;height:46px;border-radius:50%;border:2px solid #39ff8a;background:#0b2a1c;object-fit:cover;display:flex;align-items:center;justify-content:center;font:800 18px sans-serif;color:#39ff8a}
  #mdlg .who{color:#39ff8a;font:800 10px sans-serif;letter-spacing:.14em;margin-bottom:2px}
  #mdlg .tap{position:absolute;right:8px;bottom:3px;font:700 9px sans-serif;color:#6fa88a;letter-spacing:.1em}
  #btn-interact{position:fixed;z-index:26;left:50%;transform:translateX(-50%);bottom:calc(max(14px,env(safe-area-inset-bottom,14px)) + 112px);display:none;min-width:130px;padding:11px 18px;border-radius:26px;border:2px solid #ffd24a;background:rgba(30,22,0,.88);color:#ffe58a;font:800 13px sans-serif;letter-spacing:.1em;text-align:center;box-shadow:0 0 14px rgba(255,210,74,.35)}
  #btn-interact:active{background:#ffd24a;color:#201600}
  #mstart{position:fixed;z-index:26;left:50%;transform:translateX(-50%);bottom:calc(max(14px,env(safe-area-inset-bottom,14px)) + 112px);display:none;min-width:190px;padding:12px 22px;border-radius:28px;border:2px solid #ffd24a;color:#ffe58a;font:800 13px sans-serif;letter-spacing:.12em;text-align:center;background:linear-gradient(90deg,rgba(255,210,74,.45) var(--p,0%),rgba(30,22,0,.88) var(--p,0%));overflow:hidden}
  #mstart:disabled{opacity:1;border-color:#b89a38;color:#fff3c4;text-shadow:0 1px 3px #000,0 0 6px #000}
  #mstart.ready{background:#ffd24a;color:#201600;box-shadow:0 0 18px rgba(255,210,74,.6)}
  #mchill{position:fixed;z-index:28;left:50%;top:40%;transform:translate(-50%,-50%);display:none;padding:12px 16px 14px;background:rgba(4,20,13,.94);border:1px solid #1d8a52;border-top:3px solid #ffd24a;color:#e8fff1;font:700 13px sans-serif;text-align:center;min-width:230px}
  #mchill h4{margin:0 0 9px;color:#ffd24a;letter-spacing:.14em;font-size:11px}
  #mchill button{display:block;width:100%;margin:6px 0 0;padding:10px 12px;border-radius:20px;border:2px solid #39ff8a;background:#0b2a1c;color:#d8ffe8;font:800 12px sans-serif;letter-spacing:.1em}
  #mchill button.s{border-color:#7a8a80;color:#b6c8be;background:#101a15}
  #mdone{position:fixed;z-index:330;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at 50% 40%,rgba(8,40,26,.95),rgba(2,8,5,.98));color:#eaffef;font-family:sans-serif}
  #mdone h2{margin:0 0 4px;font:900 28px sans-serif;letter-spacing:.2em;color:#39ff8a;text-shadow:0 0 14px rgba(57,255,138,.6)}
  #mdone h3{margin:0 0 18px;font:700 13px sans-serif;letter-spacing:.3em;color:#9fd8b6}
  #mdone ul{list-style:none;margin:0 0 22px;padding:0;font:700 15px sans-serif}
  #mdone li{margin:7px 0;color:#d8ffe8}#mdone li:before{content:"\\2713";color:#39ff8a;margin-right:10px;font-weight:900}
  #mdone button{padding:12px 34px;border-radius:26px;border:2px solid #39ff8a;background:#0b2a1c;color:#d8ffe8;font:800 14px sans-serif;letter-spacing:.14em}
  @keyframes mpulse{0%,100%{box-shadow:0 0 0 0 rgba(255,210,74,.55)}50%{box-shadow:0 0 0 10px rgba(255,210,74,0)}}
  @keyframes mpop{0%{transform:translate(-50%,14px) scale(.96);opacity:0}100%{transform:translate(-50%,0) scale(1);opacity:1}}
  @keyframes mring{0%,100%{box-shadow:0 0 0 0 var(--c,#39ff8a)}50%{box-shadow:0 0 0 5px transparent}}
  #mdlg{border-radius:16px;border-color:var(--c,#1d8a52);box-shadow:0 6px 26px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04) inset;animation:mpop .22s ease-out;font-size:14px;padding:10px 14px 24px;width:min(580px,78vw)}
  #mdlg img,#mdlg canvas,#mdlg .ph{border-color:var(--c,#39ff8a)!important;animation:mring 1.4s infinite;flex:0 0 54px!important;width:54px!important;height:54px!important}
  #mdlg .who{color:var(--c,#39ff8a);font-size:11px}
  #mdlg .who em{font-style:normal;color:#8fb3a0;letter-spacing:.06em;font-weight:600;margin-left:6px;text-transform:none}
  #mdlg .tap{right:12px;bottom:6px;font-size:10px;color:#ffe58a;background:rgba(255,210,74,.14);border:1px solid rgba(255,210,74,.5);border-radius:10px;padding:1px 9px}
  #mstart:not(:disabled){animation:mpulse 1.2s infinite}
  #btn-interact{border-radius:30px;padding:12px 22px;animation:mpulse 1.5s infinite}
  #mchill{border-radius:20px;min-width:260px;max-width:78vw;animation:mpop .25s ease-out;padding:16px 18px 16px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  #mchill .big{font:900 19px sans-serif;color:#eaffef;letter-spacing:.04em;margin-bottom:3px}
  #mchill .sub{font:500 12px/1.35 sans-serif;color:#9fc4af;margin:0 0 6px}
  #mchill button{padding:12px 14px;font-size:13px}
  #mchill button:active{transform:scale(.97)}
  #mchill #mc-go{background:linear-gradient(180deg,#39ff8a,#17b862);color:#032a14;border-color:#bfffd9}
  #mtoast{border-radius:14px;background:linear-gradient(90deg,rgba(4,20,13,.92),rgba(30,26,4,.92))}
  #mtrack{border-radius:10px}
  @media (max-height:420px){#mdlg{width:min(480px,56vw);padding:6px 10px}#mdone h2{font-size:22px}#mdone ul{margin-bottom:12px;font-size:13px}}
  `; document.head.appendChild(css);
  const tt=el('div','mtoast'); document.body.appendChild(tt); let ttT=0; const toast=t=>{ tt.textContent=t; tt.style.opacity='1'; clearTimeout(ttT); ttT=setTimeout(()=>{ tt.style.opacity='0'; },2600); };
  const tr=el('div','mtrack'), way=el('div','mway',null,'<i></i><span></span>'), dlg=el('div','mdlg',''), btn=el('button','btn-interact'), chill=el('div','mchill'), done=el('div','mdone');
  const sb=el('button','mstart'); sb.type='button'; document.body.appendChild(sb); ['touchstart','mousedown','pointerdown'].forEach(n=>sb.addEventListener(n,e=>e.stopPropagation(),{passive:true}));
  btn.type='button'; [tr,way,dlg,btn,chill,done].forEach(e=>document.body.appendChild(e));
  const stop=e=>{ e.stopPropagation(); };
  ['touchstart','mousedown','pointerdown'].forEach(n=>{ [btn,chill,dlg,tr,done].forEach(e=>e.addEventListener(n,stop,{passive:true})); });

  /* ---------- save / restore (dedicated save file: www/savegame.js) ---------- */
  // Runtime state lives in S.m01; what is written to disk is the last SAVEPOINT (cp*): progress made since the last
  // objective transition is not kept, so leaving mid-mission restarts you from the last savepoint, at the place and in the form you had then.
  const SG=G.SaveGame;
  let S={ m01:{ status:'new', obj:-1, evidence:[], dead:[], paused:false, cp:null, cpObj:-1, cpDead:[], cpEvidence:[] } };
  { let j=SG&&SG.get('missions'); if(!j){ try{ j=JSON.parse(localStorage.getItem('omniverse_missions_v1')||'null'); }catch(e){} }
    if(j&&j.m01){ const q=j.m01, s=S.m01; s.status=q.status==='offered'||q.status==='active'||q.status==='done'?q.status:'new'; s.paused=!!q.paused; s.cp=q.cp||null;
      s.obj=typeof q.obj==='number'?q.obj:-1; s.evidence=(q.evidence||[]).slice(); s.dead=(q.dead||[]).slice(); s.cpObj=s.obj; s.cpDead=s.dead.slice(); s.cpEvidence=s.evidence.slice();
      if(s.status==='active'&&(s.obj<0||s.obj>5)) s.obj=0; } }
  const save=()=>{
    const s=S.m01;
    if(s.status==='active'&&s.obj>=0&&s.obj<=5&&s.cpObj!==s.obj){       // a new SAVEPOINT: stable objective reached
      s.cpObj=s.obj; s.cpDead=s.dead.slice(); s.cpEvidence=s.evidence.slice(); try{ s.cp=G.snapshot(); s.cp.flying=false; s.cp.hp=1; s.cp.en=1; }catch(e){}
      if(s.obj>0) setTimeout(()=>{ try{ toast('MISSION SAVEPOINT'); }catch(e){} },900); }
    if(s.status==='done'){ s.cpObj=100; s.cpDead=s.dead.slice(); s.cpEvidence=s.evidence.slice(); }
    if(s.status==='offered'||s.status==='new'){ s.cpObj=-1; s.cpDead=[]; s.cpEvidence=[]; }
    if(SG){ SG.set('missions',{ m01:{ status:s.status, obj:s.cpObj, evidence:s.cpEvidence, dead:s.cpDead, paused:s.paused, cp:s.cp } }); SG.flush(); }
  };
  window.__MIS={ S, reset(){ if(SG) SG.clear(); else { try{ localStorage.removeItem('omniverse_missions_v1'); }catch(e){} } location.reload(); }, update:()=>{}, marker:()=>null,
    resumePoint:()=>{ const s=S.m01; return (s.status==='active'&&!s.paused&&s.cp)?s.cp:null; } };

  /* ---------- story dialogue (never blocks play: lines auto-advance, tap to skip) ---------- */
  const PEOPLE={ BEN:{n:'BEN',role:'Hero',c:'#39ff8a'}, GWEN:{n:'GWEN',role:'on comms',c:'#ff7ad9',img:'portraits/gwen.png'}, MAX:{n:'GRANDPA MAX',role:'on comms',c:'#ffd24a',img:'portraits/grandpa_max.png'} };
  const DQ=[]; let dCur=null, dT=0, dTy=0, dFull='', dTxt=null;
  function say(lines,cb){ lines.forEach((l,i)=>DQ.push({who:l[0],t:l[1],cb:i===lines.length-1?cb:null})); if(!dCur&&DQ.length) dShow(DQ.shift()); }
  function dShow(l){
    dCur=l; dFull=l.t; dTy=0; dT=Math.max(3.2,Math.min(7,l.t.length*.06))+l.t.length/45; const P=PEOPLE[l.who]; dlg.style.setProperty('--c',P.c);
    let pic; if(P.img){ pic=el('img'); pic.src=P.img; pic.style.cssText='flex:0 0 54px;width:54px;height:54px;border-radius:50%;border:2px solid '+P.c+';object-fit:cover'; pic.onerror=()=>{ const s=el('div',null,'ph',P.n[0]); pic.replaceWith(s); }; }
    else { pic=el('div',null,'ph','B'); try{ const pc=G.getPortrait('ben'); if(pc){ const c=el('canvas'); c.width=c.height=108; c.getContext('2d').drawImage(pc,0,0,108,108); c.style.cssText='flex:0 0 54px;width:54px;height:54px;border-radius:50%;border:2px solid '+P.c; pic=c; } }catch(e){} }
    dlg.innerHTML=''; dlg.appendChild(pic); const t=el('div',null,null,'<div class="who">'+P.n+'<em>'+P.role+'</em></div><div></div>'); dTxt=t.lastChild; dlg.appendChild(t); dlg.appendChild(el('div',null,'tap','NEXT \u25B8')); dlg.style.display='flex';
    dlg.style.animation='none'; void dlg.offsetWidth; dlg.style.animation='';
  }
  function dNext(){ if(dCur&&dCur.cb){ const f=dCur.cb; dCur=null; try{ f(); }catch(e){ console.warn(e); } } dCur=null; if(DQ.length) dShow(DQ.shift()); else dlg.style.display='none'; }
  // tap: first tap finishes the typing, second tap goes to the next line
  dlg.addEventListener('click',()=>{ if(dCur&&dTxt&&dTy<dFull.length){ dTy=dFull.length; dTxt.textContent=dFull; dT=Math.max(dT,2.2); } else dNext(); });
  const talking=()=>!!dCur||DQ.length>0;

  /* ---------- world helpers ---------- */
  const gy=(x,z)=>G.groundTopAt(x,z);
  const lamb=(c,o)=>new THREE.MeshLambertMaterial(Object.assign({color:c},o||{}));
  const box=(par,w,h,d,mat,x,y,z)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; par.add(m); return m; };
  const solid=(x0,x1,z0,z1,base,h)=>{ const c={x0,x1,z0,z1,top:base+h,bot:base}; G.colliders.push(c); return c; };
  const unsolid=c=>{ const i=G.colliders.indexOf(c); if(i>=0) G.colliders.splice(i,1); };
  const IA=[]; // interactables: {id,x,y,z,r,label,enabled(),use(),mesh}
  const props=[]; // everything the mission added to the world (for cleanup)
  const addProp=o=>{ props.push(o); return o; };

  /* ---------- sites (chosen from the real map: see README) ---------- */
  // A: the attack - a road crossing on the east side of the city grid.  S: a secluded relay bunker on the empty north-west coast.
  const SITE_A={x:182,z:-84}, SITE_S={x:-170,z:-262}, DOOR={x:SITE_S.x,z:SITE_S.z+7.2}, SPOT={x:70,z:112};   // SPOT: where Grandpa Max sends you first (a road in the east of town)
  let wreck=null, comp=null, term=null, holo=null, rvIA=null;

  function buildWreck(){
    if(wreck) return; const y=gy(SITE_A.x+7,SITE_A.z+3), g=new THREE.Group(); g.position.set(SITE_A.x+7,y,SITE_A.z+3);
    const dark=lamb(0x2a2d33), hot=lamb(0x1a1a1a,{emissive:0x442200});
    box(g,2.6,.5,1.8,dark,0,.35,0).rotation.set(.1,.4,.18); box(g,1.2,.4,1.1,hot,.9,.6,.5).rotation.set(.3,.2,.5); box(g,.4,1.1,.3,dark,-1.1,.7,-.3).rotation.z=.7; box(g,1.6,.12,.5,lamb(0x555b66),-.4,.9,.8).rotation.set(0,.5,.4);
    const core=new THREE.Mesh(new THREE.SphereGeometry(.26,10,8),new THREE.MeshBasicMaterial({color:0x66ccff})); core.position.set(.2,.75,.1); g.add(core);
    if(MA.blade){ const m=THREE.SkeletonUtils.clone(MA.blade); MA.mats(m,null,true); m.scale.setScalar(.07); m.rotation.set(.5,.3,1.1); m.position.set(-.4,.7,0); g.add(m); }
    scene.add(g); wreck={g,core,t:0,x:g.position.x,z:g.position.z,y}; addProp(g);
    IA.push({id:'wreck',x:wreck.x,y,z:wreck.z,r:4.2,label:'\u{1F50D} SEARCH THE WRECK',enabled:()=>S.m01.status==='active'&&!S.m01.paused&&S.m01.obj===1,use:useWreck});
  }
  function buildCompound(){
    if(comp) return; const cx=SITE_S.x, cz=SITE_S.z, y=gy(cx,cz), g=new THREE.Group(); g.position.set(cx,y,cz);
    const con=lamb(0x4b4f57), conD=lamb(0x2c2f35), trim=lamb(0xffd24a,{emissive:0x332800}), W=16, D=12, H=4.6, T=.7;
    box(g,W+3,.25,D+3,lamb(0x3a3d42),0,.12,0).receiveShadow=true;                 // slab
    box(g,W,H,T,con,0,H/2,-D/2+T/2); box(g,T,H,D,con,-W/2+T/2,H/2,0); box(g,T,H,D,con,W/2-T/2,H/2,0);   // N, W, E walls
    const gap=3.4, wsz=(W-gap)/2; box(g,wsz,H,T,con,-(gap/2+wsz/2),H/2,D/2-T/2); box(g,wsz,H,T,con,gap/2+wsz/2,H/2,D/2-T/2); box(g,gap,H-3,T,con,0,3+(H-3)/2,D/2-T/2);   // S wall around the door gap
    box(g,W+.4,.3,T+.3,conD,0,H+.05,-D/2+T/2); box(g,W+.4,.3,T+.3,conD,0,H+.05,D/2-T/2);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(gap+.6,.25,.12),new THREE.MeshBasicMaterial({color:0xff3a2a})); stripe.position.set(0,3.15,D/2+.1); g.add(stripe);
    const door=box(g,gap,3,.3,lamb(0x6b7078),0,1.5,D/2-T/2); door.userData.open=0;
    // interior: crates + the relay terminal against the back wall
    box(g,1.6,1.2,1.6,lamb(0x6a5a3a),-5.2,.7,-3.6); box(g,1.2,.9,1.2,lamb(0x5a4a2e),-4.2,.55,-4.2); box(g,1.4,1.1,1.4,lamb(0x3d5a6a),5.1,.65,-3.9); box(g,.9,.8,.9,lamb(0x3d5a6a),4.3,.5,2.4);
    const desk=box(g,3.2,1,1.1,conD,0,.65,-D/2+2.2);
    const cv=document.createElement('canvas'); cv.width=256; cv.height=128; const cx2=cv.getContext('2d'); const tex=new THREE.CanvasTexture(cv);
    const paint=(txt,col)=>{ cx2.fillStyle='#03140d'; cx2.fillRect(0,0,256,128); cx2.fillStyle=col; cx2.font='bold 15px monospace'; txt.forEach((s,i)=>cx2.fillText(s,12,30+i*22)); tex.needsUpdate=true; };
    paint(['RELAY 07  ONLINE','UPLINK: ENCRYPTED','> AWAITING OPERATOR'],'#39ff8a');
    const scr=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.2),new THREE.MeshBasicMaterial({map:tex})); scr.position.set(0,1.9,-D/2+2.65); g.add(scr);
    // relay tower
    const tw=new THREE.Group(); tw.position.set(-W/2-3.2,0,-3); for(let i=0;i<4;i++){ const a=i*Math.PI/2+Math.PI/4; const leg=box(tw,.18,22,.18,lamb(0x8a8f99),Math.cos(a)*1.1,11,Math.sin(a)*1.1); }
    for(let k=1;k<7;k++){ box(tw,2.4-k*.28,.12,.12,lamb(0x8a8f99),0,k*3,0); box(tw,.12,.12,2.4-k*.28,lamb(0x8a8f99),0,k*3,0); }
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.4,8,6),new THREE.MeshBasicMaterial({color:0xff2a2a})); beacon.position.set(0,22.2,0); tw.add(beacon); g.add(tw);
    scene.add(g);
    const cols={ n:solid(cx-W/2,cx+W/2,cz-D/2,cz-D/2+T,y,H), w:solid(cx-W/2,cx-W/2+T,cz-D/2,cz+D/2,y,H), e:solid(cx+W/2-T,cx+W/2,cz-D/2,cz+D/2,y,H),
      s1:solid(cx-W/2,cx-gap/2,cz+D/2-T,cz+D/2,y,H), s2:solid(cx+gap/2,cx+W/2,cz+D/2-T,cz+D/2,y,H), door:solid(cx-gap/2,cx+gap/2,cz+D/2-T,cz+D/2,y,H),
      desk:solid(cx-1.6,cx+1.6,cz-D/2+1.65,cz-D/2+2.75,y,1.1), c1:solid(cx-6,cx-4.4,cz-4.4,cz-2.8,y,1.3), c2:solid(cx+4.4,cx+5.8,cz-4.6,cz-3.2,y,1.3), tower:solid(cx-W/2-4.3,cx-W/2-2.1,cz-4.1,cz-1.9,y,22) };
    comp={g,door,cols,paint,tex,beacon,y,t:0,open:false};
    addProp(g);
    IA.push({id:'door',x:cx,y,z:cz+D/2+1.2,r:4.6,label:'\u{1F6AA} FORCE THE DOOR',enabled:()=>S.m01.status==='active'&&!S.m01.paused&&S.m01.obj===2&&!comp.open,use:useDoor});
    term={x:cx,y,z:cz-D/2+3.6};
    IA.push({id:'term',x:term.x,y,z:term.z,r:4.2,label:'\u{1F4BB} HACK THE TERMINAL',enabled:()=>S.m01.status==='active'&&!S.m01.paused&&S.m01.obj===4,use:useTerminal});
  }
  function openDoor(instant){ if(!comp||comp.open) return; comp.open=true; unsolid(comp.cols.door); if(instant){ comp.door.userData.open=1; comp.door.position.y=1.5+3.1; } else { comp.openT=0; try{ Audio_.explosion&&Audio_.explosion(); }catch(e){} } }
  function holoShow(){
    if(!MA.psyphon||!comp) return; if(holo){ comp.g.remove(holo); holo=null; }
    const m=THREE.SkeletonUtils.clone(MA.psyphon); const mat=new THREE.MeshBasicMaterial({color:0x58d8ff,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,wireframe:false});
    m.traverse(o=>{ if(o.isMesh){ o.material=mat; o.frustumCulled=false; } }); m.scale.setScalar(1.15); m.position.set(0,1.3,-D_HALF+3.9); holo=m; holo.userData.t=0; comp.g.add(m);
  }
  const D_HALF=6;

  /* ---------- enemy encounters (real enemies in the real world) ---------- */
  const groups={};   // key -> {defs, spawned}
  function spawnGroup(key,defs){
    const gr=groups[key]||(groups[key]={defs,spawned:false}); if(gr.spawned) return; gr.spawned=true;
    for(const d of defs){ if(S.m01.dead.indexOf(d.id)>=0) continue;
      const en=G.spawnEnemy(d.type,d.x,d.z); if(!en) continue; en.mission=true; en.mid=d.id; en.alertedT=1e6; en.home.set(d.x,0,d.z);
      if(d.air){ en.mesh.position.y+=d.air; }
      en.onDeath=e=>{ if(S.m01.dead.indexOf(e.mid)<0){ S.m01.dead.push(e.mid); save(); } }; }
  }
  const GA=[{id:'a1',type:'blade_drone',x:SITE_A.x-6,z:SITE_A.z-8,air:2},{id:'a2',type:'blade_drone',x:SITE_A.x+9,z:SITE_A.z-10,air:2},{id:'a3',type:'laser_drone',x:SITE_A.x+2,z:SITE_A.z-16}];
  const GB=[{id:'b1',type:'laser_drone',x:SITE_S.x-3.5,z:SITE_S.z-1},{id:'b2',type:'laser_drone',x:SITE_S.x+4,z:SITE_S.z+1},{id:'b3',type:'blade_drone',x:SITE_S.x,z:SITE_S.z-2,air:1}];
  const allDead=ids=>ids.every(i=>S.m01.dead.indexOf(i)>=0);

  /* ---------- marker + tracker ---------- */
  let marker=null; // {x,z,label}
  const m=()=>S.m01;
  function objective(){
    const s=m(); if(s.status==='offered') return {title:'GRANDPA MAX',t:'Check out the spot Grandpa Max marked',mk:{x:SPOT.x,z:SPOT.z,label:'SIGNAL SPOT'}};
    if(s.status!=='active') return null;
    switch(s.obj){
      case 0: return {t:'Investigate the drone attack',mk:{x:SITE_A.x,z:SITE_A.z,label:'ATTACK SITE'}};
      case 1: return {t:'Search the drone wreckage',mk:wreck?{x:wreck.x,z:wreck.z,label:'WRECKAGE'}:null};
      case 2: return {t:'Follow the signal to its source',mk:{x:DOOR.x,z:DOOR.z,label:'RELAY BUNKER'}};
      case 3: return {t:'Defeat the guards inside',mk:{x:SITE_S.x,z:SITE_S.z,label:'GUARDS'}};
      case 4: return {t:'Use the relay terminal',mk:term?{x:term.x,z:term.z,label:'TERMINAL'}:null};
      case 5: { const r=G.rv(); return {t:'Report to Grandpa Max at the Rust Bucket',mk:{x:r.x,z:r.z,label:'RUST BUCKET'}}; }
    } return null;
  }
  function refreshHud(){
    const s=m(); const o=objective();
    if(s.status==='active'&&s.paused){ tr.className='paused'; tr.style.display='block'; tr.innerHTML='<b>MISSION PAUSED</b>Tap to resume: Unwanted Visitors'; marker=null; return; }
    if(!o){ tr.style.display='none'; marker=null; return; }
    tr.className=''; tr.style.display='block'; tr.innerHTML='<b>'+(o.title||'UNWANTED VISITORS')+'</b>'+o.t; marker=o.mk;
  }
  tr.addEventListener('click',()=>{ if(m().status==='active'&&m().paused){ m().paused=false; save(); refreshHud(); toast('MISSION RESUMED'); } });
  const _v=new THREE.Vector3();
  function placeWay(){
    if(!marker||!G.playing()){ way.style.display='none'; return; }
    const y=gy(marker.x,marker.z)+2.6; _v.set(marker.x,y,marker.z); const d=Math.hypot(marker.x-player.pos.x,marker.z-player.pos.z);
    _v.project(camera); let x=_v.x, yy=_v.y; const behind=_v.z>1; if(behind){ x=-x; yy=-yy; }
    const W=innerWidth, H=innerHeight; let px=(x*.5+.5)*W, py=(-yy*.5+.5)*H; const mx=34, my=60;
    const off=behind||px<mx||px>W-mx||py<my||py>H-my; px=Math.max(mx,Math.min(W-mx,px)); py=Math.max(my,Math.min(H-my,py)); if(behind){ py=Math.max(py,H*.5); }
    way.style.display='block'; way.style.transform='translate('+px.toFixed(0)+'px,'+py.toFixed(0)+'px)'; way.lastChild.textContent=marker.label+' '+Math.round(d*.73)+'m'; way.firstChild.style.opacity=off?'.8':'1';
  }
  window.__MIS.marker=()=>marker&&!m().paused?{x:marker.x,z:marker.z,label:marker.label}:null;

  /* ---------- chill prompt ---------- */
  let pendingChill=null;
  const CHILL_LINES={ 'DRONES DESTROYED':['Drones down!','Nice shooting, Ben. Keep the momentum, or take a breather. Your progress is saved either way.'], 'GUARDS DEFEATED':['Bunker cleared!','That is the whole welcome party. Ready to see what is on that terminal?'], 'SOURCE INVESTIGATED':['Mystery cracked!','You found who is behind it. Head home to report, or come back to this later.'] };
  function askChill(title){ pendingChill=title; }
  function showChill(title){
    const L=CHILL_LINES[title]||[title,'Your progress is saved.'];
    chill.innerHTML='<div class="big">'+L[0]+'</div><div class="sub">'+L[1]+'</div><button type="button" id="mc-go">LET\'S KEEP GOING \u25B6</button><button type="button" class="s" id="mc-chill">CHILL FOR A BIT \u263E</button>'; chill.style.display='block';
    chill.querySelector('#mc-go').onclick=()=>{ chill.style.display='none'; const o=objective(); if(o){ toast('NEW OBJECTIVE: '+o.t.toUpperCase()); const h={1:'Walk up to the wreckage and tap the button that pops up.',3:'Clear out the guards inside the bunker.',4:'Walk up to the terminal and tap the button that pops up.',5:'Head back to the Rust Bucket. Follow the yellow marker.'}[m().obj]; if(h&&!talking()) say([['GWEN',h]]); } };
    chill.querySelector('#mc-chill').onclick=()=>{ chill.style.display='none'; m().paused=true; save(); refreshHud(); toast('TAKING IT EASY. TAP THE BANNER TO RESUME'); };
  }
  function advance(to,chillTitle){ const s=m(); s.obj=to; save(); refreshHud(); if(chillTitle) askChill(chillTitle); }

  /* ---------- interactions ---------- */
  function useWreck(){
    const s=m(); if(s.obj!==1) return; s.obj=99; save(); refreshHud();
    if(wreck){ VFX.sparks(new THREE.Vector3(wreck.x,wreck.y+.8,wreck.z),12,5,0x88ccff,.25,.5); }
    say([['BEN','This one still has power in its core. Some kind of transmitter is built in.'],['GWEN','Run the signal. I can trace it from here...'],['GWEN','Got it. It is a repeating beacon, going out to an old relay station up on the north-west coast.'],['BEN','Drones that phone home. Great. I will go knock.']],()=>{
      if(!s.evidence.includes('signal')) s.evidence.push('signal'); s.obj=2; save(); refreshHud(); toast('EVIDENCE RECOVERED: SIGNAL LOG'); });
  }
  function useDoor(){ const s=m(); if(s.obj!==2||!comp||comp.open) return; openDoor(false); s.obj=3; save(); refreshHud(); toast('DOOR OPEN'); say([['BEN','Door is open. Company is inside.']]); }
  function useTerminal(){
    const s=m(); if(s.obj!==4) return; s.obj=98; save(); refreshHud();
    if(comp) comp.paint(['TRANSMISSION DECODED','SENDER: PSYPHON','ORDER: RECOVER OMNITRIX','DRONES: DEPLOYED'],'#58d8ff'); holoShow();
    say([['BEN','Hold on. That is a Vilgax drone signal... and that is Psyphon.'],['GWEN','Psyphon? Vilgax\'s weapons dealer? Ben, he is the one who sends these drones after the Omnitrix.'],['BEN','So this whole relay was his. Looks like he is not done with me.'],['GWEN','Get back here. Grandpa Max needs to hear this.']],()=>{
      if(!s.evidence.includes('psyphon')) s.evidence.push('psyphon'); s.obj=5; save(); refreshHud(); toast('EVIDENCE RECOVERED: PSYPHON TRANSMISSION');
      say([['MAX','Ben, I just got Gwen\'s message. Come straight back to the Rust Bucket. We need to talk about Psyphon.']]); askChill('SOURCE INVESTIGATED'); });
  }
  function useMax(){
    const s=m(); if(s.obj!==5) return; s.obj=97; save(); refreshHud();
    say([['BEN','Grandpa, the drones were coming from a relay station. Psyphon is behind it.'],['MAX','I was afraid of that. Good work, you two. We will plan our next move.']],()=>complete());
  }
  function complete(){
    const s=m(); s.status='done'; s.obj=100; s.paused=false; save(); refreshHud(); marker=null; way.style.display='none';
    done.innerHTML='<h3>MISSION 01 \u2022 UNWANTED VISITORS</h3><h2>NICE ONE, BEN!</h2><ul><li>Drone attack stopped</li><li>Evidence recovered</li><li>Source investigated</li><li>Psyphon unmasked</li></ul><button type="button">BACK TO THE ADVENTURE \u25B6</button>';
    done.style.display='flex'; done.querySelector('button').onclick=()=>{ done.style.display='none'; };
    try{ Audio_.menu&&Audio_.menu(false); }catch(e){}
  }

  /* ---------- the main step ---------- */
  let clock=0, started=false, restoreDone=false, offerAt=null, chargeT=0, beacon=null;
  function nearest(){
    let best=null, bd=1e9; for(const a of IA){ if(!a.enabled()) continue; const d=Math.hypot(a.x-player.pos.x,a.z-player.pos.z); if(d<a.r&&Math.abs(player.pos.y-a.y)<7&&d<bd){ best=a; bd=d; } } return best;
  }
  function interact(){ const a=nearest(); if(a) a.use(); }
  btn.addEventListener('touchstart',e=>{ e.preventDefault(); interact(); },{passive:false}); btn.addEventListener('click',()=>interact());
  addEventListener('keydown',e=>{ if(e.code==='KeyG'&&G.playing()) interact(); });
  window.__MIS.interact=interact;

  function ensureWorld(){
    const s=m(); if(s.status==='new'||s.status==='offered') return; buildWreck(); buildCompound();
    if(!restoreDone){ restoreDone=true; if(s.obj>=3||(s.status==='done')) openDoor(true); if(s.obj>=5||s.status==='done'){ if(comp&&s.evidence.includes('psyphon')) comp.paint(['TRANSMISSION DECODED','SENDER: PSYPHON','ORDER: RECOVER OMNITRIX','DRONES: DEPLOYED'],'#58d8ff'); }
      // obj values 97-99 are the short "talking" states; if a reload lands there, fall back to the interaction they came from
      if(s.obj===99){ s.obj=1; } else if(s.obj===98){ s.obj=4; } else if(s.obj===97){ s.obj=5; } refreshHud(); }
  }
  function buildBeacon(){
    if(beacon) return; const y=gy(SPOT.x,SPOT.z), g=new THREE.Group(); g.position.set(SPOT.x,y,SPOT.z); g.userData.t=0;
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,34,14,1,true),new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending})); beam.position.y=17; g.add(beam);
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.6,4.3,40),new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.y=.12; g.add(ring);
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.55),new THREE.MeshBasicMaterial({color:0xfff2b0})); core.position.y=2.2; g.add(core);
    scene.add(g); beacon=g; addProp(g);
  }
  function startMission(){
    const s=m(); if(s.status!=='offered'||chargeT<2) return; s.status='active'; s.obj=0; sb.style.display='none';
    if(beacon){ scene.remove(beacon); beacon=null; } save(); ensureWorld(); refreshHud();
    say([['GWEN','Ben! Grandpa Max said you reached the spot. Good, because we have trouble. Something is attacking a nearby area.'],['BEN','Finally, something interesting!'],['GWEN','Just investigate first. Do not rush in without thinking.'],['BEN','You know me better than that.'],['GWEN','Exactly! I have put the location on your map.']],()=>toast('NEW MISSION: UNWANTED VISITORS'));
  }
  sb.addEventListener('click',()=>startMission()); sb.addEventListener('touchstart',e=>{ e.preventDefault(); startMission(); },{passive:false});
  addEventListener('keydown',e=>{ if(e.code==='KeyG'&&G.playing()) startMission(); });
  function step(dt){
    if(!G.playing()){ tr.style.visibility='hidden'; way.style.display='none'; btn.style.display='none'; sb.style.display='none'; return; }
    tr.style.visibility='visible'; const s=m(); clock+=dt;
    if(dCur){ if(dTxt&&dTy<dFull.length){ dTy=Math.min(dFull.length,dTy+dt*46); dTxt.textContent=dFull.slice(0,Math.floor(dTy)); } else if(chill.style.display!=='block'){ dT-=dt; if(dT<=0) dNext(); } }
    if(!dCur&&DQ.length) dShow(DQ.shift());
    if(pendingChill&&!talking()){ const c=pendingChill; pendingChill=null; showChill(c); }
    // lightweight animation of props + mixers
    for(const en of enemies){ if(en.mixer&&en.alive) en.mixer.update(dt); }
    if(wreck){ wreck.t+=dt; wreck.core.material.color.setHex((Math.sin(wreck.t*9)>0)?0x66ccff:0x224466); if(Math.random()<dt*3) VFX.sparks(new THREE.Vector3(wreck.x,wreck.y+.9,wreck.z),3,3,0x99ddff,.2,.35); if(Math.random()<dt*2) VFX.particle('smoke_01',new THREE.Vector3(wreck.x,wreck.y+1,wreck.z),{size:.5,sizeEnd:1.6,life:1.6,tint:0x333333,alpha:.55,vel:new THREE.Vector3((Math.random()-.5)*.3,1.1,(Math.random()-.5)*.3)}); }
    if(comp){ comp.t+=dt; comp.beacon.material.color.setHex(Math.sin(comp.t*3)>0?0xff2a2a:0x551010);
      if(comp.openT!=null&&comp.openT<1){ comp.openT=Math.min(1,comp.openT+dt/1.1); comp.door.position.y=1.5+3.1*comp.openT; } }
    if(holo){ holo.userData.t+=dt; holo.rotation.y=Math.sin(holo.userData.t*.8)*.35; holo.children.length; const k=holo.userData.t; if(k>14&&holo.parent){ holo.parent.remove(holo); holo=null; } }
    if(s.status==='new'){
      // Grandpa Max passes on a random tip some time after you start playing (kept per session, so it is never instant)
      if(offerAt==null) offerAt=clock+25+Math.random()*45;
      if(clock>offerAt&&!talking()){ s.status='offered'; s.obj=-1; save(); buildBeacon(); refreshHud();
        const tips=[ 'Ben, I picked up some odd energy readings on the east side of town. Probably nothing, but go and check it out. I have marked it on your map.',
          'Ben, an old contact of mine says there is strange radio chatter by the east road. Take a look when you get the chance. It is marked on your map.',
          'Ben, something has been jamming my scanner over to the east. Swing by and see what it is whenever you are ready. I marked the spot.' ];
        say([['MAX',tips[Math.floor(Math.random()*tips.length)]]],()=>toast('NEW MISSION TIP: CHECK YOUR MAP')); }
      sb.style.display='none'; return;
    }
    if(s.status==='offered'){
      if(!beacon) buildBeacon();
      const d=Math.hypot(player.pos.x-SPOT.x,player.pos.z-SPOT.z);
      if(d<14){ chargeT=Math.min(2,chargeT+dt); } else chargeT=Math.max(0,chargeT-dt*2);
      const near=d<14, ready=chargeT>=2;
      if(near){ sb.style.display='block'; sb.disabled=!ready; sb.className=ready?'ready':''; sb.style.setProperty('--p',(chargeT/2*100).toFixed(0)+'%'); const t=ready?'\u25B6 TAP TO START!':'SCANNING SIGNAL '+Math.floor(chargeT/2*100)+'%'; if(sb.textContent!==t) sb.textContent=t; } else sb.style.display='none';
      if(beacon){ beacon.userData.t+=dt; beacon.rotation.y+=dt*.8; beacon.children[1].scale.setScalar(1+.12*Math.sin(beacon.userData.t*3)); }
      placeWay(); btn.style.display='none'; return;
    }
    sb.style.display='none';
    ensureWorld();
    if(s.status!=='active'){ btn.style.display='none'; way.style.display='none'; return; }
    if(!s.paused){
      const dA=Math.hypot(player.pos.x-SITE_A.x,player.pos.z-SITE_A.z), dS=Math.hypot(player.pos.x-SITE_S.x,player.pos.z-SITE_S.z);
      if(s.obj===0){ if(dA<75&&!groups.A){ spawnGroup('A',GA); toast('HOSTILE DRONES DETECTED'); }
        if(groups.A&&allDead(['a1','a2','a3'])){ advance(1,'DRONES DESTROYED'); say([['GWEN','Nice work. Check the wreckage before anything else burns up.']]); } }
      if(s.obj===3||s.obj===2||s.obj===4){ if(dS<95&&!groups.B&&!allDead(['b1','b2','b3'])) spawnGroup('B',GB); }
      if(s.obj===3&&allDead(['b1','b2','b3'])){ advance(4,'GUARDS DEFEATED'); say([['BEN','Quiet now. That terminal in the back looks important.']]); }
    }
    placeWay();
    // interact button
    const a=s.paused?null:nearest(); if(a){ btn.style.display='block'; if(btn.textContent!==a.label) btn.textContent=a.label; } else btn.style.display='none';
  }
  // the RV interaction sits next to the Rust Bucket
  IA.push({id:'max',get x(){ return G.rv().x; },get z(){ return G.rv().z; },get y(){ return gy(G.rv().x,G.rv().z); },r:7,label:'\u{1F4AC} TALK TO GRANDPA',enabled:()=>m().status==='active'&&!m().paused&&m().obj===5,use:useMax});
  window.__MIS.update=step;
  window.__MIS.sites={SITE_A,SITE_S,DOOR};
  window.__MIS.dbg={ offerNow(){ offerAt=-1; }, get charge(){ return chargeT; }, get comp(){ return comp; }, get wreck(){ return wreck; }, get term(){ return term; }, say, spawnGroup, GA, GB, S:()=>S };
  refreshHud();
};
})();
