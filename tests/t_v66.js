const {boot}=require('./vmharness.js');
const g=boot(); g.start(); g.step(30); const d=g.d;
for(const id of ['heatblast','four_arms','echo_echo']){
  const a=d.ALIENS.find(x=>x.id===id); d.OMNI.charge=100; d.OMNI.lock=0; d.tryTransform(a); g.step(60);
  d.player.pos.set(0.5,d.groundTopAt(0.5,0.5)+1,0.5); g.step(10); d.moveInput.y=1; g.step(120);
  if(id==='echo_echo'){ d.jumpPress(); g.step(10); d.jumpPress(); g.step(10); }
  d.moveInput.y=0; g.step(10);
}
console.log('errors',g.errors.length,g.errors.slice(0,3).join('|').slice(0,300));
