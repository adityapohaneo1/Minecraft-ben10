const {boot}=require('./vmharness.js');
const g=boot(); g.start(); g.step(30); const d=g.d;
const a=d.ALIENS.find(x=>x.id==='xlr8'); d.OMNI.charge=100; d.OMNI.lock=0; d.tryTransform(a); g.step(60);
d.player.pos.set(0.5,d.groundTopAt(0.5,0.5)+1,0.5); g.step(10); d.moveInput.y=1;
for(let i=0;i<200;i++){ d.player.superT=1; d.player.superSpeed=1; d.player.onGround=true; g.step(1); }
console.log('errors',g.errors.length,g.errors.slice(0,3).join('|').slice(0,400));
