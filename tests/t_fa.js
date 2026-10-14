const {boot}=require('./vmharness.js');
const g=boot(); g.start(); g.step(30); const d=g.d; let n=0;
for(const id of ['four_arms','heatblast','wildvine']){
  const a=d.ALIENS.find(x=>x.id===id); d.OMNI.charge=100; d.OMNI.lock=0; d.tryTransform(a); g.step(60);
  d.player.pos.set(0.5,d.groundTopAt(0.5,0.5)+1,0.5); d.player.vel.set(0,0,0); d.player.onGround=true; g.step(10);
  if(id==='four_arms'){ d.jumpPress(); g.step(2); console.log('four_arms after jumpPress: vy=',d.player.vel.y.toFixed(1),'charging=',!!d.player.leapCharging,'airborne=',!d.player.onGround); d.moveInput.y=1; g.step(90); d.moveInput.y=0; }
  if(id==='heatblast'){ const p=d.player.model.userData.parts; console.log('heat flame parent is head:',p.hfGroup&&p.hfGroup.parent===p.head); d.moveInput.y=1; g.step(90); d.moveInput.y=0; }
  if(id==='wildvine'){ d.jumpPress(); d.keys['Space']=true; g.step(120); d.keys['Space']=false; console.log('wildvine swing on:',g.win.__wv.SW.on); }
}
console.log('errors',g.errors.length,g.errors.slice(0,3).join('|').slice(0,300));
