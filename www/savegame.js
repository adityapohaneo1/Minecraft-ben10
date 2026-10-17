/* =====================================================================================
   SAVE GAME - one dedicated, versioned save file for the whole game (localStorage key omniverse_save_v1).
     world     : where you were - position, heading, alien (or Ben), flying/ground, health, energy
     missions  : mission progress (status, last checkpoint objective, evidence, defeated enemies, checkpoint place + form)
   game.html writes `world` every few seconds and whenever the app is hidden/closed; missions.js writes `missions`
   at every mission savepoint. On launch: if a mission is running you restart at its last savepoint, otherwise you
   resume exactly where you stopped.  SaveGame.clear() erases everything (new game).
===================================================================================== */
window.SaveGame=(function(){
  const KEY='omniverse_save_v1', VER=1; let mem=null;
  function read(){
    if(mem) return mem;
    try{ const j=JSON.parse(localStorage.getItem(KEY)||'null'); if(j&&typeof j==='object'&&j.v===VER) mem=j; }catch(e){}
    if(!mem) mem={v:VER};
    return mem;
  }
  function flush(){ try{ const m=read(); m.savedAt=Date.now(); localStorage.setItem(KEY,JSON.stringify(m)); return true; }catch(e){ return false; } }
  return {
    read, flush,
    get:k=>read()[k],
    set(k,v,now){ read()[k]=v; if(now) flush(); },
    has:()=>!!(read().world||read().missions),
    clear(){ mem={v:VER}; try{ localStorage.removeItem(KEY); localStorage.removeItem('omniverse_missions_v1'); }catch(e){} }
  };
})();
