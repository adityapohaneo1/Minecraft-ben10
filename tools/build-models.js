// Rebuilds www/models.js (the GLB bodies embedded as base64 so the game also works from file:// and inside the APK)
// from models/*.glb.   Usage:  node tools/build-models.js
// Bodies that have no GLB here are simply skipped (the game falls back to the box body for that alien).
const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const kinds=['ben','diamondhead','four_arms','heatblast','xlr8','echo_echo','cannonbolt','upgrade'];   // first block: the main bodies
const extra=['cannonbolt_ball','jetray','chromastone','wildvine'];                                       // appended one per line
const b64=k=>{ const f=path.join(root,'models',k+'.glb'); if(!fs.existsSync(f)){ console.log('skip',k); return null; } const b=fs.readFileSync(f); console.log(k,(b.length/1024).toFixed(0)+' KB'); return b.toString('base64'); };
let out='window.__GLB_DATA={\n';
for(const k of kinds){ const s=b64(k); if(s) out+='"'+k+'":"'+s+'",\n'; }
out+='};\n';
for(const k of extra){ const s=b64(k); if(s) out+='\nwindow.__GLB_DATA.'+k+'="'+s+'";\n'; }
fs.writeFileSync(path.join(root,'www','models.js'),out); console.log('wrote www/models.js');
