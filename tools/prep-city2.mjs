// Prepares the second city: node tools/prep-city2.mjs <decoded big_city GLB> <out.glb> <out colliders.json>
// (decode Draco first with gltf-transform.) Bakes the Z-up node transform, crops to the core district, scales,
// downsizes textures to webp and emits an AABB collider list (4-unit raster, merged runs).
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const [,,IN,OUT,COL]=process.argv;
const S=0.42, CROP=[-495,-150,165,505];           // crop in raw (x, rawY) native units
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const d=await io.read(IN), root=d.getRoot(), buf=root.listBuffers()[0];
const cx=(CROP[0]+CROP[2])/2, cz=-(CROP[1]+CROP[3])/2;
const cells=new Map(); const CS=4;            // collider raster
const tri=[[0,0,0],[0,0,0],[0,0,0]];
for(const n of root.listNodes()){ const m=n.getMesh(); if(!m) continue;
  for(const p of m.listPrimitives()){
    const pos=p.getAttribute('POSITION'), nor=p.getAttribute('NORMAL'), uv=p.getAttribute('TEXCOORD_0'), ind=p.getIndices();
    const N=pos.getCount(), P=new Float32Array(N*3), NR=nor?new Float32Array(N*3):null, UV=uv?new Float32Array(N*2):null, v=[0,0,0];
    for(let i=0;i<N;i++){ pos.getElement(i,v); P[i*3]=v[0]; P[i*3+1]=v[2]; P[i*3+2]=-v[1]; if(nor){ nor.getElement(i,v); NR[i*3]=v[0]; NR[i*3+1]=v[2]; NR[i*3+2]=-v[1]; } if(uv){ uv.getElement(i,v); UV[i*2]=v[0]; UV[i*2+1]=v[1]; } }
    const I=ind?ind.getArray():Uint32Array.from({length:N},(_,i)=>i), keep=[];
    for(let t=0;t<I.length;t+=3){ const a=I[t],b=I[t+1],c=I[t+2]; const mx=(P[a*3]+P[b*3]+P[c*3])/3, mz=-(P[a*3+2]+P[b*3+2]+P[c*3+2])/3;
      if(mx<CROP[0]||mx>CROP[2]||mz<CROP[1]||mz>CROP[3]) continue;
      const ex=Math.max(Math.abs(P[a*3]-P[b*3]),Math.abs(P[a*3]-P[c*3])), ez=Math.max(Math.abs(P[a*3+2]-P[b*3+2]),Math.abs(P[a*3+2]-P[c*3+2]));
      if(ex>400||ez>400) continue;            // giant ground / sky plates
      keep.push(a,b,c); }
    if(keep.length<3){ p.dispose(); continue; }
    const mp=new Map(), nv=[], ni=[]; for(const k of keep){ let r=mp.get(k); if(r===undefined){ r=nv.length; mp.set(k,r); nv.push(k); } ni.push(r); }
    const nP=new Float32Array(nv.length*3), nN=NR?new Float32Array(nv.length*3):null, nU=UV?new Float32Array(nv.length*2):null;
    nv.forEach((k,r)=>{ nP[r*3]=(P[k*3]-cx)*S; nP[r*3+1]=P[k*3+1]*S; nP[r*3+2]=(P[k*3+2]-cz)*S; if(nN){ nN[r*3]=NR[k*3]; nN[r*3+1]=NR[k*3+1]; nN[r*3+2]=NR[k*3+2]; } if(nU){ nU[r*2]=UV[k*2]; nU[r*2+1]=UV[k*2+1]; } });
    p.setAttribute('POSITION',d.createAccessor().setType('VEC3').setArray(nP).setBuffer(buf));
    if(nN) p.setAttribute('NORMAL',d.createAccessor().setType('VEC3').setArray(nN).setBuffer(buf)); else p.setAttribute('NORMAL',null);
    if(nU) p.setAttribute('TEXCOORD_0',d.createAccessor().setType('VEC2').setArray(nU).setBuffer(buf));
    for(const s of p.listSemantics()) if(!['POSITION','NORMAL','TEXCOORD_0'].includes(s)) p.setAttribute(s,null);
    p.setIndices(d.createAccessor().setType('SCALAR').setArray(Uint32Array.from(ni)).setBuffer(buf));
    // collider raster: any triangle that rises > 2.2 above street level marks its cells (walls count by their extent)
    for(let t=0;t<ni.length;t+=3){ for(let k=0;k<3;k++){ const r=ni[t+k]; tri[k]=[nP[r*3],nP[r*3+1],nP[r*3+2]]; }
      const ymax=Math.max(tri[0][1],tri[1][1],tri[2][1]), ymin=Math.min(tri[0][1],tri[1][1],tri[2][1]); if(ymax<2.4) continue;
      const nx=(tri[1][1]-tri[0][1])*(tri[2][2]-tri[0][2])-(tri[1][2]-tri[0][2])*(tri[2][1]-tri[0][1]), ny=(tri[1][2]-tri[0][2])*(tri[2][0]-tri[0][0])-(tri[1][0]-tri[0][0])*(tri[2][2]-tri[0][2]), nz=(tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-(tri[1][1]-tri[0][1])*(tri[2][0]-tri[0][0]); const nl=Math.hypot(nx,ny,nz)||1;
      const wall=Math.abs(ny)/nl<.6;                 // roofs and walls only (flat low things like awnings are fine either way)
      if(!wall&&ymin<2) continue;
      const x0=Math.min(tri[0][0],tri[1][0],tri[2][0]), x1=Math.max(tri[0][0],tri[1][0],tri[2][0]), z0=Math.min(tri[0][2],tri[1][2],tri[2][2]), z1=Math.max(tri[0][2],tri[1][2],tri[2][2]);
      if(x1-x0>40||z1-z0>40) continue;
      for(let X=Math.floor(x0/CS);X<=Math.floor(x1/CS);X++) for(let Z=Math.floor(z0/CS);Z<=Math.floor(z1/CS);Z++){ const key=X+','+Z; const o=cells.get(key)||{h:0,w:0}; o.h=Math.max(o.h,ymax); if(wall) o.w++; cells.set(key,o); } }
  } }
for(const n of root.listNodes()){ n.setTranslation([0,0,0]); n.setRotation([0,0,0,1]); n.setScale([1,1,1]); }
for(const sc of root.listScenes()) for(const c of sc.listChildren()) { const kids=c.listChildren(); }
await d.transform(prune(),dedup(),textureCompress({encoder:sharp,targetFormat:'jpeg',resize:[128,128],quality:60}));
await io.write(OUT,d);
// cells -> solid if it has walls (buildings), merge horizontal runs of equal quantised height
const solid=[]; for(const [k,o] of cells){ if(o.w<2||o.h<4) continue; const [X,Z]=k.split(',').map(Number); solid.push([X,Z,Math.round(o.h/3)*3]); }
const set=new Map(solid.map(s=>[s[0]+','+s[1],s])); const rects=[];
for(const s of solid.sort((a,b)=>a[1]-b[1]||a[0]-b[0])){ const key=s[0]+','+s[1]; if(!set.has(key)) continue; let X1=s[0]; while(set.has((X1+1)+','+s[1])&&set.get((X1+1)+','+s[1])[2]===s[2]) X1++;
  let Z1=s[1]; ext: for(;;){ for(let X=s[0];X<=X1;X++){ const q=set.get(X+','+(Z1+1)); if(!q||q[2]!==s[2]) break ext; } Z1++; }
  for(let X=s[0];X<=X1;X++) for(let Z=s[1];Z<=Z1;Z++) set.delete(X+','+Z);
  rects.push([s[0]*CS,(X1+1)*CS,s[1]*CS,(Z1+1)*CS,s[2]]); }
const W=(CROP[2]-CROP[0])*S, H=(CROP[3]-CROP[1])*S;
fs.writeFileSync(COL,JSON.stringify({w:W,h:H,rects}));
console.log('size',W.toFixed(0),H.toFixed(0),'colliders',rects.length,'glb',(fs.statSync(OUT).size/1024).toFixed(0)+'KB');
