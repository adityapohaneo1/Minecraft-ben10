/* CITY2 - "Titan Bay": the second city (supplied big_city model), built on its own island out in the eastern sea,
   joined to the downtown coast by the Harbour Bridge (a long suspension road bridge). Also owns the new low-poly tree.
   Loaded after terrain.js: it patches TERR.h/urb/inBounds so the island is ordinary ground (swimming, terrain mesh, minimap,
   vehicles and spawns all see it) and the bridge is a walkable/drivable deck. game.html calls CITY2.build(ctx) once the scene exists. */
(function(){
const T=window.THREE, D=window.__CITY2, TERR=window.TERR, C=window.__CITY; if(!T||!D||!TERR||!C) return;
const GY=1.5, cb=C.bounds, ZB=Math.round((cb[1]+cb[3])/2);
/* ---- layout: the bridge leaves the east coast on the downtown centre line, the island sits beyond the sea gap ---- */
const h0=TERR.h, urb0=TERR.urb, inB0=TERR.inBounds;
let xs=cb[2]+140; { let wet=0; for(let x=cb[2];x<cb[2]+900;x+=2){ if(h0(x,ZB)<-.25){ if(++wet>=30){ xs=x-58; break; } } else wet=0; } }
const BR=250, xw=xs+BR, M=30, hx=D.w/2+M, hz=D.h/2+M, cx=xw+hx, cz=ZB, RAD=26;
const xa=xs-14, xb=xw+10;
function isl(x,z){ const dx=Math.abs(x-cx)-hx+RAD, dz=Math.abs(z-cz)-hz+RAD; return Math.hypot(Math.max(dx,0),Math.max(dz,0))+Math.min(Math.max(dx,dz),0)-RAD; }
const inBox=(x,z,p)=>x>xw-p&&x<xw+2*hx+p&&z>cz-hz-p&&z<cz+hz+p;
TERR.h=function(x,z){ if(inBox(x,z,14)){ const d=isl(x,z); if(d<10) return d<=0?0:Math.max(-9,-d*.9); } return h0(x,z); };
TERR.urb=function(x,z){ return inBox(x,z,2)&&isl(x,z)<=0?1:urb0(x,z); };
TERR.inBounds=function(x,z){ return inB0(x,z)||inBox(x,z,160); };
const LAY={ZB,xs,xw,xa,xb,cx,cz,hx,hz,ready:false}; window.CITY2={layout:LAY};

/* ---- helpers ---- */
const b2buf=s=>{ const bin=atob(s), n=bin.length, u=new Uint8Array(n); for(let i=0;i<n;i++) u[i]=bin.charCodeAt(i); return u.buffer; };
const parse=k=>new Promise((res,rej)=>{ const s=window.__GLB_DATA&&window.__GLB_DATA[k]; if(!s) return rej('no '+k); try{ new T.GLTFLoader().parse(b2buf(s),'',res,rej); }catch(e){ rej(e); } });
function tex(w,h,draw,rep){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new T.CanvasTexture(c); t.wrapS=t.wrapT=T.RepeatWrapping; t.anisotropy=4; if(rep) t.repeat.set(rep[0],rep[1]); return t; }
function noise(g,w,h,n,a){ for(let i=0;i<n;i++){ const v=Math.random()*255|0; g.fillStyle='rgba('+v+','+v+','+v+','+a+')'; g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2); } }
function roundRect(sh,x0,z0,x1,z1,r,ccw){ const p=ccw?[[x0+r,z0],[x1-r,z0],[x1,z0+r],[x1,z1-r],[x1-r,z1],[x0+r,z1],[x0,z1-r],[x0,z0+r]]:[[x0+r,z0],[x0,z0+r],[x0,z1-r],[x0+r,z1],[x1-r,z1],[x1,z1-r],[x1,z0+r],[x1-r,z0]];
  sh.moveTo(p[0][0],p[0][1]); const q=(a,b,cx_,cz_)=>sh.quadraticCurveTo(cx_,cz_,a,b);
  if(ccw){ sh.lineTo(p[1][0],p[1][1]); q(p[2][0],p[2][1],x1,z0); sh.lineTo(p[3][0],p[3][1]); q(p[4][0],p[4][1],x1,z1); sh.lineTo(p[5][0],p[5][1]); q(p[6][0],p[6][1],x0,z1); sh.lineTo(p[7][0],p[7][1]); q(p[0][0],p[0][1],x0,z0); }
  else { q(p[1][0],p[1][1],x0,z0); sh.lineTo(p[2][0],p[2][1]); q(p[3][0],p[3][1],x0,z1); sh.lineTo(p[4][0],p[4][1]); q(p[5][0],p[5][1],x1,z1); sh.lineTo(p[6][0],p[6][1]); q(p[7][0],p[7][1],x1,z0); sh.lineTo(p[0][0],p[0][1]); } }
function flatShape(outer,inner,y,mat,tile){ const sh=new T.Shape(); roundRect(sh,cx-hx+outer,cz-hz+outer,cx+hx-outer,cz+hz-outer,Math.max(1,RAD-outer),true);
  if(inner!==undefined){ const hole=new T.Path(); roundRect(hole,cx-hx+inner,cz-hz+inner,cx+hx-inner,cz+hz-inner,Math.max(1,RAD-inner),false); sh.holes.push(hole); }
  const g=new T.ShapeGeometry(sh,10); g.rotateX(Math.PI/2); const uv=g.attributes.uv, pos=g.attributes.position; for(let i=0;i<uv.count;i++) uv.setXY(i,pos.getX(i)/tile,pos.getZ(i)/tile);
  const m=new T.Mesh(g,mat); m.position.y=y; m.receiveShadow=true; return m; }
const lam=(o,extra)=>new T.MeshLambertMaterial(Object.assign({color:o.color?o.color.clone():0xffffff,map:o.map||null,side:T.DoubleSide},extra||{}));

/* ---- the new tree (instanced, shared by downtown, the bridge approach and Titan Bay) ---- */
function makeTrees(g,list,GYw,scene){ let src=null; g.scene.traverse(o=>{ if(o.isMesh&&!src) src=o; }); if(!src||!list.length) return null; g.scene.updateMatrixWorld(true); const geo=src.geometry.clone(); geo.applyMatrix4(src.matrixWorld); geo.computeBoundingBox(); const bb=geo.boundingBox; geo.translate(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2); const k=9/Math.max(.001,bb.max.y-bb.min.y); geo.scale(k,k,k);
  const mat=lam(src.material,{alphaTest:.45,emissive:new T.Color(0x1d3515)}); mat.transparent=false; const im=new T.InstancedMesh(geo,mat,list.length), o=new T.Object3D();
  list.forEach((t,i)=>{ o.position.set(t[0],GYw+(t[3]||0)-.15,t[1]); o.rotation.set(0,t[2],0); o.scale.setScalar(t[4]||.7); o.updateMatrix(); im.setMatrixAt(i,o.matrix); }); im.frustumCulled=false; scene.add(im); return im; }

LAY.build=async function(ctx){
  const {scene,gridAdd,DECKS}=ctx, grp=new T.Group(); scene.add(grp); LAY.group=grp;
  const mk=(geo,mat,x,y,z)=>{ const m=new T.Mesh(geo,mat); m.position.set(x,y,z); grp.add(m); return m; };
  /* ---- island ground: concrete plaza + harbour ring road + sea wall ---- */
  const conc=tex(128,128,(g,w,h)=>{ g.fillStyle='#7d7f82'; g.fillRect(0,0,w,h); noise(g,w,h,900,.07); g.strokeStyle='rgba(30,32,36,.5)'; g.lineWidth=2; g.strokeRect(1,1,w-2,h-2); g.beginPath(); g.moveTo(w/2,0); g.lineTo(w/2,h); g.moveTo(0,h/2); g.lineTo(w,h/2); g.lineWidth=1; g.stroke(); });
  const asph=tex(128,128,(g,w,h)=>{ g.fillStyle='#34363a'; g.fillRect(0,0,w,h); noise(g,w,h,1400,.09); });
  const pm=m=>{ m.polygonOffset=true; m.polygonOffsetFactor=-2; m.polygonOffsetUnits=-2; return m; };
  grp.add(flatShape(1.5,undefined,GY+.03,pm(new T.MeshLambertMaterial({map:conc})),7));
  grp.add(flatShape(11,24,GY+.06,pm(new T.MeshLambertMaterial({map:asph})),8));
  // ring road centre dashes + edge lines
  { const dashes=[], ring=(inset,fn)=>{ const x0=cx-hx+inset, x1=cx+hx-inset, z0=cz-hz+inset, z1=cz+hz-inset; for(let x=x0+RAD;x<x1-RAD;x+=9){ fn(x,z0,0); fn(x,z1,0); } for(let z=z0+RAD;z<z1-RAD;z+=9){ fn(x0,z,1); fn(x1,z,1); } };
    const dg=new T.BoxGeometry(4,.04,.35), dm=new T.MeshBasicMaterial({color:0xe9d86a}); ring(17.5,(x,z,v)=>{ dashes.push([x,z,v]); });
    const im=new T.InstancedMesh(dg,dm,dashes.length), o=new T.Object3D(); dashes.forEach((d,i)=>{ o.position.set(d[0],GY+.1,d[1]); o.rotation.set(0,d[2]?Math.PI/2:0,0); o.updateMatrix(); im.setMatrixAt(i,o.matrix); }); im.frustumCulled=false; grp.add(im); }
  // sea wall posts + rail
  { const posts=[], step=3.2, rr=RAD-1.2; const side=(x0,z0,x1,z1)=>{ const L=Math.hypot(x1-x0,z1-z0), n=Math.floor(L/step); for(let i=0;i<=n;i++) posts.push([x0+(x1-x0)*i/n,z0+(z1-z0)*i/n]); };
    const e=1.8; side(cx-hx+e+rr,cz-hz+e,cx+hx-e-rr,cz-hz+e); side(cx-hx+e+rr,cz+hz-e,cx+hx-e-rr,cz+hz-e); side(cx-hx+e,cz-hz+e+rr,cx-hx+e,cz+hz-e-rr); side(cx+hx-e,cz-hz+e+rr,cx+hx-e,cz+hz-e-rr);
    const im=new T.InstancedMesh(new T.BoxGeometry(.25,1.1,.25),new T.MeshLambertMaterial({color:0x8a9099}),posts.length), o=new T.Object3D(); posts.forEach((p,i)=>{ o.position.set(p[0],GY+.6,p[1]); o.updateMatrix(); im.setMatrixAt(i,o.matrix); }); im.frustumCulled=false; grp.add(im);
    const rm=new T.MeshLambertMaterial({color:0xb7bcc4}); const e2=e;
    mk(new T.BoxGeometry(2*hx-2*e2-2*rr,.14,.14),rm,cx,GY+1.1,cz-hz+e2); mk(new T.BoxGeometry(2*hx-2*e2-2*rr,.14,.14),rm,cx,GY+1.1,cz+hz-e2); mk(new T.BoxGeometry(.14,.14,2*hz-2*e2-2*rr),rm,cx-hx+e2,GY+1.1,cz); mk(new T.BoxGeometry(.14,.14,2*hz-2*e2-2*rr),rm,cx+hx-e2,GY+1.1,cz); }
  // ring road street lights (inner sidewalk), warm heads
  { const L=[], inset=26, x0=cx-hx+inset, x1=cx+hx-inset, z0=cz-hz+inset, z1=cz+hz-inset; for(let x=x0+10;x<x1-10;x+=26){ L.push([x,z0]); L.push([x,z1]); } for(let z=z0+10;z<z1-10;z+=26){ L.push([x0,z]); L.push([x1,z]); }
    const pole=new T.InstancedMesh(new T.CylinderGeometry(.12,.16,7,6),new T.MeshLambertMaterial({color:0x3a3d42}),L.length), head=new T.InstancedMesh(new T.BoxGeometry(.9,.22,.5),new T.MeshBasicMaterial({color:0xfff0c0}),L.length), o=new T.Object3D();
    L.forEach((p,i)=>{ o.position.set(p[0],GY+3.5,p[1]); o.updateMatrix(); pole.setMatrixAt(i,o.matrix); o.position.set(p[0],GY+7,p[1]); o.updateMatrix(); head.setMatrixAt(i,o.matrix); }); pole.frustumCulled=head.frustumCulled=false; grp.add(pole,head); }
  /* ---- colliders for every building block of the city model ---- */
  for(const r of D.rects) gridAdd({x0:r[0]+cx,x1:r[1]+cx,z0:r[2]+cz,z1:r[3]+cz,top:GY+r[4]});
  /* ---- the Harbour Bridge ---- */
  const HW=7, W=HW+1.8, L=xb-xa, xm=(xa+xb)/2, TH=40;
  const deckM=new T.MeshLambertMaterial({color:0x6e737a}), steel=new T.MeshLambertMaterial({color:0xc9ced6}), dark=new T.MeshLambertMaterial({color:0x2c2f34}), glow=new T.MeshBasicMaterial({color:0x58e6ff});
  mk(new T.BoxGeometry(L,1.5,2*W),deckM,xm,GY-.72,ZB);
  const road=mk(new T.BoxGeometry(L,.08,2*HW),new T.MeshLambertMaterial({map:asph.clone()}),xm,GY+.03,ZB); road.material.map.needsUpdate=true; road.material.map.repeat.set(L/8,2*HW/8); road.receiveShadow=true;
  for(const s of[-1,1]){ mk(new T.BoxGeometry(L,.32,1.8),new T.MeshLambertMaterial({color:0x9a9da2}),xm,GY+.1,ZB+s*(HW+.9)); mk(new T.BoxGeometry(L,.06,.3),new T.MeshBasicMaterial({color:0xffffff}),xm,GY+.08,ZB+s*(HW-.5)); }
  { const n=Math.floor(L/10), im=new T.InstancedMesh(new T.BoxGeometry(4.5,.04,.35),new T.MeshBasicMaterial({color:0xe9d86a}),n), o=new T.Object3D(); for(let i=0;i<n;i++){ o.position.set(xa+5+i*10,GY+.09,ZB); o.updateMatrix(); im.setMatrixAt(i,o.matrix); } im.frustumCulled=false; grp.add(im); }
  // rails (solid for walkers and cars) with glowing under-rail strip
  for(const s of[-1,1]){ const z=ZB+s*(W+.05); mk(new T.BoxGeometry(L,.18,.18),steel,xm,GY+1.35,z); mk(new T.BoxGeometry(L,.1,.1),steel,xm,GY+.8,z); mk(new T.BoxGeometry(L,.1,.12),glow,xm,GY+.3,z+s*.16);
    gridAdd({x0:xa+8,x1:xb,z0:z-.3,z1:z+.3,top:GY+2.4}); }
  { const n=Math.floor(L/3), im=new T.InstancedMesh(new T.BoxGeometry(.14,1.4,.14),steel,n*2), o=new T.Object3D(); let k=0; for(let i=0;i<n;i++) for(const s of[-1,1]){ o.position.set(xa+i*3+1,GY+.7,ZB+s*(W+.05)); o.updateMatrix(); im.setMatrixAt(k++,o.matrix); } im.frustumCulled=false; grp.add(im); }
  // piers
  { const ps=[]; for(let x=xs+14;x<xw-6;x+=30) ps.push(x); const ph=GY+11, im=new T.InstancedMesh(new T.BoxGeometry(5,ph,2*W-2),new T.MeshLambertMaterial({color:0x8c9097}),ps.length), o=new T.Object3D(); ps.forEach((x,i)=>{ o.position.set(x,GY-1.4-ph/2+1.4+.0-1.4+1.4-.0,ZB); o.position.y=GY-1.5-ph/2+0; o.updateMatrix(); im.setMatrixAt(i,o.matrix); }); im.frustumCulled=false; grp.add(im); }
  // two suspension towers + cables + hangers
  const tx=[xa+L*.30,xa+L*.70], LZ=W+1.6, yT=GY+TH, yA=GY+3;
  for(const x of tx){ for(const s of[-1,1]){ mk(new T.BoxGeometry(2.4,TH+9,2.4),steel,x,GY+TH/2-4.5+.0,ZB+s*LZ); mk(new T.BoxGeometry(.5,TH,.12),glow,x-1.26,GY+TH/2,ZB+s*LZ); mk(new T.BoxGeometry(.5,TH,.12),glow,x+1.26,GY+TH/2,ZB+s*LZ); mk(new T.BoxGeometry(4.6,1.6,4.6),dark,x,GY-5.5,ZB+s*LZ);
      gridAdd({x0:x-1.3,x1:x+1.3,z0:ZB+s*LZ-1.3,z1:ZB+s*LZ+1.3,top:GY+TH}); }
    mk(new T.BoxGeometry(2,2,2*LZ+2.4),steel,x,GY+TH-3,ZB); mk(new T.BoxGeometry(1.4,1.4,2*LZ),steel,x,GY+TH*.62,ZB); mk(new T.BoxGeometry(.3,.3,2*LZ-2),glow,x,GY+TH-4.1,ZB);
    for(const s of[-1,1]) mk(new T.SphereGeometry(.7,8,6),new T.MeshBasicMaterial({color:0xff3b3b}),x,GY+TH+.9,ZB+s*LZ); }
  const spans=[[xa,yA,tx[0],yT,13],[tx[0],yT,tx[1],yT,26],[tx[1],yT,xb,yA,13]], cabX=[], cabY=[];
  for(const sp of spans){ const n=50; for(let i=(cabX.length?1:0);i<=n;i++){ const t=i/n; cabX.push(sp[0]+(sp[2]-sp[0])*t); cabY.push(sp[1]+(sp[3]-sp[1])*t-sp[4]*4*t*(1-t)); } }
  const cabY_at=x=>{ for(let i=0;i<cabX.length-1;i++) if(x>=cabX[i]&&x<=cabX[i+1]){ const u=(x-cabX[i])/(cabX[i+1]-cabX[i]); return cabY[i]+(cabY[i+1]-cabY[i])*u; } return yA; };
  for(const s of[-1,1]){ const pts=cabX.map((x,i)=>new T.Vector3(x,cabY[i],ZB+s*LZ)); const tube=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),180,.3,5,false),steel); grp.add(tube); }
  { const xsH=[]; for(let x=xa+6;x<xb-3;x+=6) if(Math.abs(x-tx[0])>2&&Math.abs(x-tx[1])>2) xsH.push(x); const im=new T.InstancedMesh(new T.BoxGeometry(.1,1,.1),dark,xsH.length*2), o=new T.Object3D(); let k=0;
    for(const x of xsH) for(const s of[-1,1]){ const y1=cabY_at(x), y0=GY+.6, hh=Math.max(.5,y1-y0); o.position.set(x,y0+hh/2,ZB+s*LZ); o.scale.set(1,hh,1); o.updateMatrix(); im.setMatrixAt(k++,o.matrix); } im.count=k; im.frustumCulled=false; grp.add(im);
    // the cables carry the load from the towers; the outer hangers are tied to the rails by short stays
  }
  // road lamps on the deck edge
  { const lx=[]; for(let x=xa+16;x<xb-10;x+=22) lx.push(x); const pole=new T.InstancedMesh(new T.CylinderGeometry(.1,.14,5.5,6),dark,lx.length*2), head=new T.InstancedMesh(new T.BoxGeometry(1.1,.2,.5),new T.MeshBasicMaterial({color:0xfff0c0}),lx.length*2), o=new T.Object3D(); let k=0;
    for(const x of lx) for(const s of[-1,1]){ o.position.set(x+(s>0?11:0),GY+2.75,ZB+s*(W-.3)); o.updateMatrix(); pole.setMatrixAt(k,o.matrix); o.position.set(x+(s>0?11:0),GY+5.5,ZB+s*(W-.9)); o.updateMatrix(); head.setMatrixAt(k++,o.matrix); } pole.frustumCulled=head.frustumCulled=false; grp.add(pole,head); }
  // welcome boards at both ends
  { const sign=(txt,sub,x,z,ry)=>{ const c=document.createElement('canvas'); c.width=512; c.height=160; const g=c.getContext('2d'); g.fillStyle='#0d3b66'; g.fillRect(0,0,512,160); g.strokeStyle='#fff'; g.lineWidth=6; g.strokeRect(8,8,496,144); g.fillStyle='#fff'; g.font='bold 56px sans-serif'; g.textAlign='center'; g.fillText(txt,256,84); g.fillStyle='#8fe6ff'; g.font='bold 32px sans-serif'; g.fillText(sub,256,126);
      const t=new T.CanvasTexture(c); t.anisotropy=4; const m=new T.Mesh(new T.PlaneGeometry(10,3.1),new T.MeshBasicMaterial({map:t,side:T.DoubleSide})); m.position.set(x,GY+8,z); m.rotation.y=ry; grp.add(m); mk(new T.BoxGeometry(.3,8,.3),dark,x,GY+4,z-3.8*Math.cos(ry)); mk(new T.BoxGeometry(.3,8,.3),dark,x,GY+4,z+3.8*Math.cos(ry)); };
    sign('TITAN BAY','HARBOUR BRIDGE  →',xa+26,ZB-W-5,Math.PI/2*0+0); sign('DOWNTOWN','←  HARBOUR BRIDGE',xb-30,ZB+W+5,0); }
  DECKS.push({pts:[[xa,ZB],[xb,ZB]],hw:W-.2,y:GY});
  /* ---- models: Titan Bay itself, skywalks, trees ---- */
  const [cg,fb,tr]=await Promise.all([parse('city2').catch(e=>{ console.warn('city2',e); return null; }),parse('footbridge').catch(()=>null),parse('tree_lp').catch(()=>null)]);
  if(cg){ cg.scene.traverse(o=>{ if(!o.isMesh) return; const old=o.material, m=new T.MeshLambertMaterial({map:old.map||null,color:old.map?0xffffff:old.color,side:T.DoubleSide}); m.color.multiplyScalar(1.35); if(old.map) old.map.encoding=T.sRGBEncoding; m.emissive=new T.Color(0x14161a); o.material=m; o.castShadow=false; o.receiveShadow=false; });
    cg.scene.position.set(cx,GY,cz); grp.add(cg.scene); }
  if(fb){ const place=(x,z,ry)=>{ const o=fb.scene.clone(true); o.position.set(x,GY-.1,z); o.rotation.y=ry; o.traverse(m=>{ if(m.isMesh&&m.material) m.material=new T.MeshLambertMaterial({color:m.material.color,map:m.material.map||null,side:T.DoubleSide}); }); grp.add(o); };
    place(xs-34,ZB-W-12,Math.PI/2); place(xs-34,ZB+W+12,-Math.PI/2); place(xw+RAD+30,ZB-hz+24,0); }
  /* ---- trees: promenade, inner sidewalk, parks between the blocks, the bridge approach, and half of downtown ---- */
  if(tr){ const list=[], rnd=(()=>{ let s=1234567; return ()=>{ s=(s*16807)%2147483647; return s/2147483647; }; })();
    const solid=(x,z)=>{ const c=colAt(x-cx,z-cz); return c; };
    const rects=D.rects, G=new Map(), gk=(i,j)=>i*4099+j; for(const r of rects){ for(let i=Math.floor(r[0]/16);i<=Math.floor(r[1]/16);i++) for(let j=Math.floor(r[2]/16);j<=Math.floor(r[3]/16);j++){ const k=gk(i,j); let a=G.get(k); if(!a) G.set(k,a=[]); a.push(r); } }
    function colAt(x,z){ const a=G.get(gk(Math.floor(x/16),Math.floor(z/16))); if(!a) return false; for(const r of a) if(x>r[0]-2.5&&x<r[1]+2.5&&z>r[2]-2.5&&z<r[3]+2.5) return true; return false; }
    const entr=(x,z)=>Math.abs(z-ZB)<14&&x<cx-hx+40;
    const add=(x,z,sc)=>{ list.push([x,z,rnd()*6.28,0,sc||(.55+rnd()*.3)]); };
    const per=(inset,step,jit)=>{ const x0=cx-hx+inset, x1=cx+hx-inset, z0=cz-hz+inset, z1=cz+hz-inset; for(let x=x0+RAD;x<x1-RAD;x+=step){ if(!entr(x,z0)) add(x+rnd()*jit,z0); if(!entr(x,z1)) add(x+rnd()*jit,z1); } for(let z=z0+RAD;z<z1-RAD;z+=step){ if(!entr(x0,z)) add(x0,z+rnd()*jit); add(x1,z+rnd()*jit); } };
    per(6,15,4); per(27.6,19,5);
    for(let i=0;i<900&&list.length<260;i++){ const x=cx-hx+34+rnd()*(2*hx-68), z=cz-hz+34+rnd()*(2*hz-68); if(colAt(x-cx,z-cz)) continue; add(x,z); }
    for(let x=xa+20;x<xs-6;x+=16) for(const s of[-1,1]){ { const zz=ZB+s*(W+6+rnd()*3), xx=x+rnd()*5, hh=h0(xx,zz); if(hh>-.25){ add(xx,zz); list[list.length-1][3]=Math.max(0,hh); } } }
    for(const t of (window.__TREES2||[])) list.push([t[0],t[1],rnd()*6.28,0,.5+Math.min(.5,t[2]/16)]);
    // downtown trees sit in ctx.group space (ground = GY)
    LAY.trees=makeTrees(tr,list,GY,scene); }
  LAY.ready=true; return LAY; };
window.CITY2.build=LAY.build;
})();
