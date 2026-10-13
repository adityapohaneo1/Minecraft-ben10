/* =========================================================================
   LOADING SCREEN (shared by index.html = start page and game.html = the game)
   Full-screen art goes in www/loading/  ->  boot.(jpg|png|webp)  and  game.(jpg|png|webp)
   Only the progress bar overlay is drawn here; if an art file is missing the dark green backdrop shows.
   Loading screens are silent: nothing in this file touches audio.
========================================================================= */
window.LD=(function(){
  const $=id=>document.getElementById(id);
  let target=0, shown=0, last=performance.now(), done=false, started=performance.now();
  function art(base){                                      // try jpg, png, webp, jpeg in that order
    const img=$('ld-img'); if(!img) return Promise.resolve(false); const exts=['jpg','png','webp','jpeg']; let i=0;
    return new Promise(res=>{ (function next(){
      if(i>=exts.length){ res(false); return; }
      img.onload=()=>{ img.classList.add('on'); res(true); }; img.onerror=()=>{ i++; next(); }; img.src=base+'.'+exts[i];
    })(); });
  }
  function paint(){ const f=$('ld-fill'), p=$('ld-pct'); if(f) f.style.transform='scaleX('+Math.max(0,Math.min(1,shown)).toFixed(4)+')'; if(p) p.textContent=Math.round(shown*100)+'%'; }
  function frame(now){
    if(done) return; const dt=Math.min(.1,(now-last)/1000); last=now;
    shown+=(target-shown)*Math.min(1,dt*5); if(target>=1&&target-shown<.002) shown=1;   // glide toward the real progress, never backwards
    paint(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  function set(v,msg){ if(v>target) target=Math.min(1,v); if(msg){ const m=$('ld-msg'); if(m&&m.textContent!==msg) m.textContent=msg; } }
  function error(text){ const e=$('ld-err'); if(!e||done) return; e.textContent=text; e.classList.add('on'); }
  // finish: run the bar to 100%, keep the screen up at least minMs, then fade it away
  function finish(minMs){
    return new Promise(res=>{
      set(1,'READY');
      (function wait(){
        if(shown<.995||performance.now()-started<(minMs||0)){ setTimeout(wait,40); return; }
        shown=1; paint(); const el=$('ld'); done=true;
        if(el){ el.classList.add('hide'); setTimeout(()=>{ el.style.display='none'; },650); }
        setTimeout(res,380);                               // the game is already visible under the fading screen
      })();
    });
  }
  return { art, set, error, finish, get shown(){ return shown; } };
})();
