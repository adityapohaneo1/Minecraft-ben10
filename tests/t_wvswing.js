// Wildvine tentacle swing: rope length, facing lock, direction, arc size.
const {boot}=require('./vmharness.js');
const g=boot(); g.start(); g.step(30); const d=g.d; const SW=g.win.__wv.SW; const out=[]; const ok=(c,m)=>out.push((c?'PASS ':'FAIL ')+m);
const wv=d.ALIENS.find(a=>a.id==='wildvine'); d.OMNI.charge=100; d.OMNI.lock=0; d.tryTransform(wv); g.step(40);
const FACE=1.1;                                   // body heading (rad): forward = (-sin, -cos)
const PX=+process.env.PX||0.5, PZ=+process.env.PZ||0.5; const x0=PX, z0=PZ; d.player.pos.set(PX,d.groundTopAt(PX,PZ)+1,PZ); d.player.vel.set(0,0,0); d.player.onGround=true; d.moveInput.x=0; d.moveInput.y=0; g.step(6);
d.player.model.rotation.y=FACE; d.player.yaw=FACE; g.step(20);
const start=d.player.pos.clone(); const fx=-Math.sin(FACE), fz=-Math.cos(FACE);
d.jumpPress(); d.keys['Space']=true; const log=[]; let maxSpin=0, prevYaw=d.player.model.rotation.y, minAlt=99, maxFwd=0, L=0, rel=-1;
for(let i=0;i<60*6;i++){
  g.step(1);
  const ry=d.player.model.rotation.y; let dy=Math.atan2(Math.sin(ry-prevYaw),Math.cos(ry-prevYaw)); maxSpin+=Math.abs(dy); prevYaw=ry;
  const p=d.player.pos, fwd=(p.x-start.x)*fx+(p.z-start.z)*fz; if(SW.on&&SW.ph===1){ L=SW.L; maxFwd=Math.max(maxFwd,fwd); minAlt=Math.min(minAlt,p.y-d.groundTopAt(p.x,p.z,p.y)); }
  if(i%30===0) log.push('t='+(i/60).toFixed(1)+' on='+SW.on+' ph='+SW.ph+' L='+SW.L.toFixed(1)+' fwd='+fwd.toFixed(1)+' h='+(p.y-start.y).toFixed(1)+' yaw='+ry.toFixed(2));
  if(!SW.on&&SW.ph===0&&i>30&&rel<0) rel=i/60;
}
d.keys['Space']=false;
console.log(log.join('\n'));
console.log('rope L',L.toFixed(1),'| forward reach',maxFwd.toFixed(1),'| min clearance above ground',minAlt.toFixed(1),'| total body turning (rad) during swing',maxSpin.toFixed(2),'| anchor dir ok',(()=>{ const a=SW.anchor; const h=Math.hypot(a.x-start.x,a.z-start.z); return ((a.x-start.x)*fx+(a.z-start.z)*fz)/h>.98; })());
ok(L>25,'rope is long (L='+L.toFixed(1)+')'); ok(maxFwd>20,'arc carries him far forward ('+maxFwd.toFixed(1)+')'); ok(maxSpin<.6,'body does not spin ('+maxSpin.toFixed(2)+' rad of total turning)');
console.log(out.join('\n')); console.log('errors',g.errors.length, g.errors.slice(0,3).join('|').slice(0,300));
