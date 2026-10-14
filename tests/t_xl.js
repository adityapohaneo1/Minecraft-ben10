const {boot}=require('./vmharness.js');
const g=boot(); g.start(); g.step(30); const d=g.d;
const a=d.ALIENS.find(x=>x.id==='xlr8'); d.OMNI.charge=100; d.OMNI.lock=0; d.tryTransform(a); g.step(60);
d.player.pos.set(0.5,d.groundTopAt(0.5,0.5)+1,0.5); g.step(10); d.moveInput.y=1; d.player.superHeld=true; d.player.superT=1; d.player.superSpeed=1; g.step(240); console.log('superT',(d.player.superT||0).toFixed(2));
console.log('errors',g.errors.length,g.errors.slice(0,3).join('|').slice(0,300));
