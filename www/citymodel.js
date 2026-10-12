/* CITYM - the world is the supplied downtown model (data baked by tools into citydata.js).
   Buildings: two merged meshes whose facades are drawn procedurally in the shader (windows by world position, so no texture files are needed).
   Roads, crossings, pavements, grass, trees, traffic lights: built from the model's own footprints with generated textures. */
(function(){
const D=window.__CITY; if(!D||!window.THREE) return; const T=THREE;
const dec=(s,C)=>{ const b=atob(s), u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return new C(u.buffer); };
const U={night:{value:0}};
function tex(w,h,draw,rep){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new T.CanvasTexture(c); t.wrapS=t.wrapT=T.RepeatWrapping; t.anisotropy=4; if(rep) t.repeat.set(rep[0],rep[1]); return t; }
function noise(g,w,h,n,a){ for(let i=0;i<n;i++){ const v=Math.random()*255|0; g.fillStyle='rgba('+v+','+v+','+v+','+a+')'; g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2); } }
// ---- building facade shader ----
function facadeMat(kind){
  const m=new T.MeshLambertMaterial({vertexColors:true});
  m.onBeforeCompile=sh=>{ sh.uniforms.uNight=U.night;
    sh.vertexShader=sh.vertexShader.replace('void main() {','varying vec3 vWP; varying vec3 vWN;\nvoid main() {').replace('#include <begin_vertex>','#include <begin_vertex>\n vWP=(modelMatrix*vec4(position,1.0)).xyz; vWN=normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader=sh.fragmentShader.replace('void main() {','varying vec3 vWP; varying vec3 vWN; uniform float uNight;\nfloat h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }\nvoid main() {')
    .replace('#include <color_fragment>',`#include <color_fragment>
 { vec3 wn=normalize(vWN); float wall=1.0-smoothstep(0.35,0.6,abs(wn.y)); float hc=abs(wn.x)>abs(wn.z)?vWP.z:vWP.x;
   float fw=${kind==='glass'?'2.4':'3.2'}, fh=${kind==='glass'?'3.6':'3.4'}; vec2 q=vec2(hc/fw,(vWP.y-.4)/fh); vec2 id=floor(q), f=fract(q);
   float wx=${kind==='glass'?'0.10':'0.22'}, wy=${kind==='glass'?'0.14':'0.2'};
   float win=step(wx,f.x)*step(f.x,1.0-wx)*step(wy,f.y)*step(f.y,1.0-wy)*step(2.6,vWP.y);
   float rr=h21(id+floor(vWP.y*0.0)+vec2(floor(vWP.x*.07+vWP.z*.05)));
   vec3 glass=${kind==='glass'?'mix(vec3(.12,.2,.28),vec3(.3,.45,.58),rr)':'mix(vec3(.16,.2,.26),vec3(.38,.45,.52),rr)'};
   float lit=step(.62,rr)*uNight;
   float ground=1.0-step(3.0,vWP.y);
   vec3 base=diffuseColor.rgb*(.92+.12*h21(id*1.7));
   float band=step(1.0-wy*.9,f.y)*${kind==='glass'?'0.0':'1.0'};
   base*=1.0-.12*band;
   vec3 wcol=mix(base,glass,win*wall);
   wcol=mix(wcol,vec3(.1,.13,.16),ground*wall*step(.2,f.x)*step(f.x,.8)*.8);
   vec3 roof=diffuseColor.rgb*.62*(.9+.1*h21(floor(vWP.xz*.5)));
   diffuseColor.rgb=mix(roof,wcol,wall);
   diffuseColor.rgb+=vec3(1.0,.82,.45)*lit*win*wall*.9*uNight; } `); };
  return m;
}
function bldGeo(d){ const g=new T.BufferGeometry(); const p=dec(d.pos,Int16Array), P=new Float32Array(p.length); for(let i=0;i<p.length;i++) P[i]=p[i]/D.sc;
  g.setAttribute('position',new T.BufferAttribute(P,3)); g.setAttribute('normal',new T.BufferAttribute(dec(d.nor,Int8Array),3,true)); g.setAttribute('color',new T.BufferAttribute(dec(d.col,Uint8Array),3,true)); g.setIndex(new T.BufferAttribute(dec(d.idx,d.i32?Uint32Array:Uint16Array),1)); g.computeBoundingSphere(); return g; }
function build(scene,GY,gridAdd){
  const grp=new T.Group(); grp.position.y=GY; scene.add(grp);
  for(const k of ['glass','mas']){ const m=new T.Mesh(bldGeo(D.bld[k]),facadeMat(k)); m.frustumCulled=false; m.castShadow=false; m.receiveShadow=false; grp.add(m); }
  // textures
  const asphalt=tex(256,256,(g,w,h)=>{ g.fillStyle='#3a3b3f'; g.fillRect(0,0,w,h); noise(g,w,h,2600,.18); const L=(x,c,wd,dash)=>{ g.fillStyle=c; for(let y=0;y<h;y+=dash?64:h) g.fillRect(x*w-wd/2,y,wd,dash?36:h); };
    L(.03,'#ddd',3); L(.97,'#ddd',3); L(.25,'#ddd',2,true); L(.75,'#ddd',2,true); L(.485,'#e4b82a',3); L(.515,'#e4b82a',3); });
  const cross=tex(256,256,(g,w,h)=>{ g.fillStyle='#3a3b3f'; g.fillRect(0,0,w,h); noise(g,w,h,2600,.18); g.fillStyle='#e8e8e8'; for(let i=0;i<14;i++){ const o=20+i*16; if(o>w-30) break; g.fillRect(o,6,9,26); g.fillRect(o,h-32,9,26); g.fillRect(6,o,26,9); g.fillRect(w-32,o,26,9); } });
  const pave=tex(256,256,(g,w,h)=>{ g.fillStyle='#a9a79f'; g.fillRect(0,0,w,h); noise(g,w,h,2400,.16); g.strokeStyle='rgba(60,60,55,.55)'; g.lineWidth=2; for(let i=0;i<=8;i++){ g.beginPath(); g.moveTo(i*32,0); g.lineTo(i*32,h); g.moveTo(0,i*32); g.lineTo(w,i*32); g.stroke(); } });
  const grass=tex(128,128,(g,w,h)=>{ g.fillStyle='#4f8f3a'; g.fillRect(0,0,w,h); noise(g,w,h,1400,.2); });
  const quad=(b,y,map,rep,alongX)=>{ const w=b[3]-b[0], d=b[5]-b[2]; const g=new T.PlaneGeometry(w,d); g.rotateX(-Math.PI/2);
    const uv=g.attributes.uv; for(let i=0;i<uv.count;i++){ let u=uv.getX(i), v=uv.getY(i); if(alongX){ const t=u; u=v; v=t*(w/rep); } else v=v*(d/rep); uv.setXY(i,u,v); }
    const m=new T.Mesh(g,new T.MeshLambertMaterial({map,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})); m.position.set((b[0]+b[3])/2,y,(b[2]+b[5])/2); m.receiveShadow=true; grp.add(m); };
  for(const b of D.roads) quad(b,.03,asphalt,8,(b[3]-b[0])>(b[5]-b[2]));
  for(const b of D.hwy) quad(b,.03,asphalt,8,(b[3]-b[0])>(b[5]-b[2]));
  for(const b of D.cross){ const g=new T.PlaneGeometry(b[3]-b[0],b[5]-b[2]); g.rotateX(-Math.PI/2); const m=new T.Mesh(g,new T.MeshLambertMaterial({map:cross,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3})); m.position.set((b[0]+b[3])/2,.04,(b[2]+b[5])/2); m.receiveShadow=true; grp.add(m); }
  for(const b of D.grass){ const w=b[3]-b[0], d=b[5]-b[2]; const g=new T.PlaneGeometry(w,d); g.rotateX(-Math.PI/2); const uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*w/6,uv.getY(i)*d/6); const m=new T.Mesh(g,new T.MeshLambertMaterial({map:grass})); m.position.set((b[0]+b[3])/2,.06,(b[2]+b[5])/2); grp.add(m); }
  for(const b of D.paves){ const w=b[3]-b[0], d=b[5]-b[2], hh=Math.max(.05,b[4]-b[1]); const mat=new T.MeshLambertMaterial({map:pave.clone()}); mat.map.needsUpdate=true; mat.map.repeat.set(w/4,d/4); const m=new T.Mesh(new T.BoxGeometry(w,hh,d),mat); m.position.set((b[0]+b[3])/2,b[1]+hh/2,(b[2]+b[5])/2); m.receiveShadow=true; grp.add(m); }
  // trees (instanced): trunk + two canopy blobs
  { const n=D.trees.length, trunk=new T.InstancedMesh(new T.CylinderGeometry(.18,.28,1,6),new T.MeshLambertMaterial({color:0x6b4a2b}),n), crown=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshLambertMaterial({color:0xffffff}),n*2), o=new T.Object3D(), col=new T.Color();
    D.trees.forEach((b,i)=>{ const x=(b[0]+b[3])/2, z=(b[2]+b[5])/2, ht=Math.max(3,b[4]-b[1]), s=ht/7, r=(Math.abs(Math.sin(i*12.9))); const tr=ht*.38;
      o.position.set(x,tr/2,z); o.scale.set(s*1.2,tr,s*1.2); o.rotation.set(0,0,0); o.updateMatrix(); trunk.setMatrixAt(i,o.matrix);
      for(let k=0;k<2;k++){ const cs=ht*(k?.26:.34); o.position.set(x,tr+cs*(k?1.3:.55),z); o.scale.set(cs,cs*.9,cs); o.updateMatrix(); crown.setMatrixAt(i*2+k,o.matrix); col.setHSL(.25+.05*r,.5,.28+.08*r+(k?.05:0)); crown.setColorAt(i*2+k,col); } });
    trunk.frustumCulled=crown.frustumCulled=false; grp.add(trunk,crown); }
  // traffic lights (instanced): pole, arm head
  { const n=D.lights.length, pole=new T.InstancedMesh(new T.BoxGeometry(.18,6.4,.18),new T.MeshLambertMaterial({color:0x35383c}),n), head=new T.InstancedMesh(new T.BoxGeometry(.5,1.3,.4),new T.MeshLambertMaterial({color:0x1d1f22}),n), lamp=new T.InstancedMesh(new T.BoxGeometry(.3,.3,.1),new T.MeshBasicMaterial({color:0xffffff}),n*3), o=new T.Object3D(), col=new T.Color();
    D.lights.forEach((b,i)=>{ const x=(b[0]+b[3])/2, z=(b[2]+b[5])/2; o.rotation.set(0,0,0); o.scale.set(1,1,1); o.position.set(x,3.2,z); o.updateMatrix(); pole.setMatrixAt(i,o.matrix); o.position.set(x,6.0,z); o.updateMatrix(); head.setMatrixAt(i,o.matrix);
      [0xff3030,0xffc030,0x30e060].forEach((c,k)=>{ o.position.set(x,6.35-k*.4,z+.22); o.updateMatrix(); lamp.setMatrixAt(i*3+k,o.matrix); col.setHex(k===2?c:0x303030); lamp.setColorAt(i*3+k,col); }); });
    pole.frustumCulled=head.frustumCulled=lamp.frustumCulled=false; grp.add(pole,head,lamp); }
  // colliders for every building cell
  for(const b of D.boxes) gridAdd({x0:b[0],z0:b[1],x1:b[2],z1:b[3],top:GY+b[4]});
  return grp;
}
window.CITYM={build,setNight:v=>{ U.night.value=v; },bounds:D.bounds};
})();
