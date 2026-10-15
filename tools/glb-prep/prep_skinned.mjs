// usage: node prep2.mjs <in.glb> <out.glb> <kind:ben|upgrade> <maxTex>
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRMaterialsSpecular} from '@gltf-transform/extensions';
import {prune, dedup, textureCompress, flatten} from '@gltf-transform/functions';
import sharp from 'sharp';
const [,, inF, outF, kind, maxTex='1024']=process.argv;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(inF); const root=doc.getRoot();

// 1. strip unsupported extensions (r128 GLTFLoader has no clearcoat/specular)
for(const e of root.listExtensionsUsed()) if(/clearcoat|specular|ior/i.test(e.extensionName)) e.dispose();

// 2. drop the cel-shading outline shell (Ben)
for(const n of root.listNodes()){ const m=n.getMesh(); if(m&&m.listPrimitives().some(p=>{const mt=p.getMaterial(); return mt&&/Outline/i.test(mt.getName());})){ n.setMesh(null); n.setSkin(null); } }

// 3. joint pruning: keep only the joints the game drives (merge the rest into their nearest kept ancestor)
const KEEP={
 ben:n=>/^(_rootJoint|root_|pelvis_|spine_0\d_|neck_0\d_|head_0\d+$|clavicle_[lr]_|upperarm_[lr]_|lowerarm_[lr]_|hand_[lr]_|thigh_[lr]_|calf_[lr]_|foot_[lr]_|ball_[lr]_\d+$)/.test(n),
 upgrade:n=>/^(_rootJoint|bip_pelvis_|bip_spine_\d_|bip_neck_|bip_head_0\d+$|bip_collar_|bip_upperarm_|bip_lowerarm_|bip_hand_|bip_hip_|bip_knee_|bip_foot_[LR]_0\d+$)/.test(n)
}[kind];
const skin=root.listSkins()[0]; const joints=skin.listJoints();
const keepSet=new Set(joints.filter(j=>KEEP(j.getName())));
function target(j){ let c=j; while(c){ if(keepSet.has(c)) return c; c=c.getParentNode(); } return joints[0]; }
const newJoints=joints.filter(j=>keepSet.has(j)); const newIdx=new Map(newJoints.map((j,i)=>[j,i]));
const remap=joints.map(j=>newIdx.get(target(j)));
const ibmAcc=skin.getInverseBindMatrices(); const ibm=ibmAcc.getArray();
const meshNodes=root.listNodes().filter(n=>n.getSkin()===skin&&n.getMesh());
const seen=new Set();
for(const n of meshNodes) for(const p of n.getMesh().listPrimitives()){ if(seen.has(p)) continue; seen.add(p);
  let k=0; const J=[],W=[]; while(p.getAttribute('JOINTS_'+k)){ J.push(p.getAttribute('JOINTS_'+k)); W.push(p.getAttribute('WEIGHTS_'+k)); k++; }
  const cnt=J[0].getCount();
  const outJ=new Uint16Array(cnt*4), outW=new Float32Array(cnt*4);
  const tmp=[0,0,0,0];
  for(let i=0;i<cnt;i++){ const acc=new Map();
    for(let s=0;s<J.length;s++){ const jj=J[s].getElement(i,[0,0,0,0]), ww=W[s].getElement(i,[0,0,0,0]); for(let q=0;q<4;q++) if(ww[q]>0){ const t=remap[jj[q]]; acc.set(t,(acc.get(t)||0)+ww[q]); } }
    const top=[...acc.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4); let tot=top.reduce((s,e)=>s+e[1],0)||1;
    for(let q=0;q<4;q++){ if(q<top.length){ outJ[i*4+q]=top[q][0]; outW[i*4+q]=top[q][1]/tot; } } }
  for(let s=1;s<J.length;s++){ p.setAttribute('JOINTS_'+s,null); p.setAttribute('WEIGHTS_'+s,null); }
  J[0].setArray(outJ); W[0].setArray(outW);
  // JOINTS accessor type must hold the new range; Uint16 is fine
  J[0].setType('VEC4'); W[0].setType('VEC4'); W[0].setNormalized(false); 
}
// rebuild inverse-bind matrices for the kept joints
const nb=new Float32Array(newJoints.length*16); newJoints.forEach((j,i)=>{ const o=joints.indexOf(j); nb.set(ibm.subarray(o*16,o*16+16),i*16); });
ibmAcc.setArray(nb);
for(const j of joints) if(!keepSet.has(j)) skin.removeJoint(j);
console.log('joints',joints.length,'->',skin.listJoints().length);

// 4. cleanup + texture shrink
await doc.transform(prune(), dedup());
await doc.transform(textureCompress({encoder:sharp,resize:[+maxTex,+maxTex]}));
await io.write(outF,doc);
import fs from 'fs'; console.log(outF, (fs.statSync(outF).size/1024).toFixed(0)+' KB');
