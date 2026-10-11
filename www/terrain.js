/* =====================================================================================
   TERRAIN - deterministic heightfield for the whole region (pure functions, no THREE / DOM).
   dh = ground height ABOVE the flat city level (city level == 0). The water surface sits at WATERDH.
     * irregular coastline (several landmasses blended, noisy edge), sea outside it
     * flat urban plateau around the origin (dh is EXACTLY 0 there, so every lot / road keeps working)
     * rolling hills + mountain massifs beyond the city, fading into beaches at the coast
     * rivers carved through the plateau (roads cross them on bridges)
   Heights are baked lazily into 128x128-cell tiles (8 unit cells) and read back bilinearly.
   ===================================================================================== */
(function(){
const CELL=12, TN=32, TS=CELL*TN;
const WATERDH=-1.1;                       // water surface (abs 0.4) relative to the city level (abs 1.5)
const BX=5500, BZ=3300;                   // playable rectangle (the sea fills what the land does not)
function hs(ix,iz,s){ let h=(Math.imul(ix|0,374761393)+Math.imul(iz|0,668265263)+Math.imul(s|0,2147483629))|0; h=Math.imul(h^(h>>>15),2246822519); h=Math.imul(h^(h>>>13),3266489917); return ((h^(h>>>16))>>>0)/4294967296; }
function vn(x,z,s){ const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz, ux=fx*fx*(3-2*fx), uz=fz*fz*(3-2*fz);
  const a=hs(ix,iz,s), b=hs(ix+1,iz,s), c=hs(ix,iz+1,s), d=hs(ix+1,iz+1,s); return a+(b-a)*ux+(c-a)*uz+(a-b-c+d)*ux*uz; }
function fbm(x,z,s,o){ let a=.5,f=1,t=0,n=0; for(let i=0;i<o;i++){ t+=a*vn(x*f,z*f,s+i*17); n+=a; a*=.5; f*=2.03; } return t/n; }
const sm=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };

/* ---- landmasses: main island (city), east peninsula (mountains), south-west island (separated by a strait) ---- */
const BLOBS=[[0,0,3900,2550],[3500,-650,1900,1500],[-3900,1950,1250,850],[-2300,-2300,1500,900]];
function landField(x,z){
  let m=-9; for(let i=0;i<BLOBS.length;i++){ const b=BLOBS[i]; const v=1-Math.hypot((x-b[0])/b[2],(z-b[1])/b[3]); if(v>m) m=v; }
  return m+.16*(fbm(x/760,z/760,3,4)-.5)*2+.05*(vn(x/190,z/190,9)-.5);
}

/* ---- rivers: control points -> smoothed polyline -> bucketed segments ---- */
const RIVERS=[
  {name:'BELLWOOD RIVER',w:24,pts:[[3600,-2050],[3000,-1500],[2300,-1000],[1950,-350],[1750,350],[1250,900],[600,1250],[-150,1650],[-650,2150],[-1050,2800],[-1250,3400]]},
  {name:'HOLLOW CREEK',w:17,pts:[[-3300,-1500],[-2500,-1000],[-1850,-420],[-1550,250],[-1650,900],[-1450,1500],[-1500,2200],[-1650,2800],[-1750,3400]]},
];
function catmull(p0,p1,p2,p3,t){ const t2=t*t,t3=t2*t; return [0,1].map(k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3)); }
const SEGS=[]; const BUCK=new Map(), BS=128;
(function(){
  RIVERS.forEach((R,ri)=>{ const P=R.pts, out=[];
    for(let i=0;i<P.length-1;i++){ const p0=P[Math.max(0,i-1)],p1=P[i],p2=P[i+1],p3=P[Math.min(P.length-1,i+2)], n=Math.max(4,Math.round(Math.hypot(p2[0]-p1[0],p2[1]-p1[1])/36));
      for(let k=0;k<n;k++){ const q=catmull(p0,p1,p2,p3,k/n); const wob=(vn(q[0]/260,q[1]/260,40+ri)-.5)*36; q[0]+=wob*.7; q[1]-=wob*.7; out.push(q); } }
    out.push(P[P.length-1].slice()); R.line=out;
    for(let i=0;i<out.length-1;i++){ const a=out[i], b=out[i+1], w=R.w*(.85+.5*vn(a[0]/500,a[1]/500,60+ri))*(1+.25*(i/out.length)); const s={ax:a[0],az:a[1],bx:b[0],bz:b[1],w,ri}; SEGS.push(s);
      const x0=Math.floor((Math.min(a[0],b[0])-250)/BS), x1=Math.floor((Math.max(a[0],b[0])+250)/BS), z0=Math.floor((Math.min(a[1],b[1])-250)/BS), z1=Math.floor((Math.max(a[1],b[1])+250)/BS);
      for(let X=x0;X<=x1;X++) for(let Z=z0;Z<=z1;Z++){ const k=X+','+Z; let l=BUCK.get(k); if(!l) BUCK.set(k,l=[]); l.push(s); } } });
})();
/* distance to the nearest river centre line, and that river's half width there */
function riverQuery(x,z){
  const l=BUCK.get(Math.floor(x/BS)+','+Math.floor(z/BS)); if(!l) return null; let bd=1e9,bw=0;
  for(let i=0;i<l.length;i++){ const s=l[i], dx=s.bx-s.ax, dz=s.bz-s.az, t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(dx*dx+dz*dz))), d=Math.hypot(x-s.ax-dx*t,z-s.az-dz*t)-s.w; if(d<bd){ bd=d; bw=s.w; } }
  return bd<240?{d:bd,w:bw}:null;                         // d < 0 inside the channel core
}

const R0=2100, R1=3100;                  // city plateau radius / full hill amplitude radius (distorted by noise)
function hillR(x,z){ return Math.hypot(x*.92,z*1.12)+520*(fbm(x/1500,z/1500,21,3)-.5); }
const MASSIFS=[[3550,-900,190,520],[2900,-1900,120,420],[-3800,1900,110,380],[-2400,-2350,130,430],[3900,300,90,350],[-4300,-800,100,500],[600,-2900,80,400]];
/* spots kept dead flat whatever the hills say: far-out landmarks (farm, gas station) and anything else that must sit on level ground */
const FLAT=[[2400,0],[-2400,160],[1280,0],[-1280,0]];
function hillH(x,z,HR){
  const u=sm(R0,R1,HR===undefined?hillR(x,z):HR); if(u<=0) return 0;
  let fl=1; for(let i=0;i<FLAT.length;i++){ const d=Math.hypot(x-FLAT[i][0],z-FLAT[i][1]); if(d<260) fl=Math.min(fl,sm(110,260,d)); } if(fl<=0) return 0;
  const n=fbm(x/430,z/430,5,5), r=1-Math.abs(2*fbm(x/700+9,z/700,8,3)-1);
  let h=u*(12+78*n*n+34*r*r);
  for(let i=0;i<MASSIFS.length;i++){ const m=MASSIFS[i], d=Math.hypot(x-m[0],z-m[1]); if(d<m[3]*3) h+=m[2]*Math.exp(-(d*d)/(2*m[3]*m[3]))*(.82+.36*vn(x/120,z/120,70+i)); }
  return h*fl;
}
let CLS=0;
function exact(x,z){ return exactLH(x,z,landField(x,z),hillR(x,z)); }
function exactLH(x,z,L,HR){
  CLS=0;
  if(L<=0){ CLS=1; return Math.max(-9,WATERDH+L*46); }
  if(L<.06) CLS=1;
  let h=WATERDH*(1-sm(0,.035,L));
  const hh=hillH(x,z,HR); if(hh>0) h+=hh*sm(.035,.13,L);
  const rq=riverQuery(x,z);
  if(rq){ if(rq.d<16) CLS=2; const w2=Math.min(230,26+Math.max(0,h)*1.3), t=sm(0,w2,rq.d), bed=-5.4+(Math.max(h,0)+5.4)*t; if(bed<h) h=bed; }
  if(h>1.5&&CLS===0) CLS=3;
  return h;
}
/* ---- baked tiles ---- */
const TILES=new Map(), TILEC=new Map(), tk=(tx,tz)=>(tx+512)*1024+(tz+512);
function bake(tx,tz){ const k=tk(tx,tz); let t=TILES.get(k); if(t) return t;
  t=new Float32Array(TN*TN); const c=new Uint8Array(TN*TN), ox=tx*TS, oz=tz*TS, ST=4, CN=TN/ST+1, Lc=new Float32Array(CN*CN), Hc=new Float32Array(CN*CN);
  for(let j=0;j<CN;j++) for(let i=0;i<CN;i++){ const x=ox+i*ST*CELL, z=oz+j*ST*CELL; Lc[j*CN+i]=landField(x,z); Hc[j*CN+i]=hillR(x,z); }   // the smooth fields are sampled on a coarse lattice and interpolated
  for(let j=0;j<TN;j++){ const cj=Math.floor(j/ST), fj=(j-cj*ST)/ST;
    for(let i=0;i<TN;i++){ const ci=Math.floor(i/ST), fi=(i-ci*ST)/ST, a=cj*CN+ci;
      const L=Lc[a]*(1-fi)*(1-fj)+Lc[a+1]*fi*(1-fj)+Lc[a+CN]*(1-fi)*fj+Lc[a+CN+1]*fi*fj, HR=Hc[a]*(1-fi)*(1-fj)+Hc[a+1]*fi*(1-fj)+Hc[a+CN]*(1-fi)*fj+Hc[a+CN+1]*fi*fj;
      t[j*TN+i]=exactLH(ox+i*CELL,oz+j*CELL,L,HR); c[j*TN+i]=CLS; } }
  TILES.set(k,t); TILEC.set(k,c); return t; }
const CA=[null,null,null,null], CK=[-1,-1,-1,-1]; let cn=0;
function tile(tx,tz){ const k=tk(tx,tz); for(let i=0;i<4;i++) if(CK[i]===k) return CA[i]; const t=bake(tx,tz); CK[cn]=k; CA[cn]=t; cn=(cn+1)&3; return t; }
function node(ix,iz){ const tx=Math.floor(ix/TN), tz=Math.floor(iz/TN); return tile(tx,tz)[(iz-tz*TN)*TN+(ix-tx*TN)]; }
function cls(x,z){ const ix=Math.round(x/CELL), iz=Math.round(z/CELL), tx=Math.floor(ix/TN), tz=Math.floor(iz/TN); tile(tx,tz); return TILEC.get(tk(tx,tz))[(iz-tz*TN)*TN+(ix-tx*TN)]; }
function h(x,z){
  const gx=x/CELL, gz=z/CELL, ix=Math.floor(gx), iz=Math.floor(gz), fx=gx-ix, fz=gz-iz;
  const a=node(ix,iz), b=node(ix+1,iz), c=node(ix,iz+1), d=node(ix+1,iz+1);
  return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz;
}
function prefetch(px,pz,R,ms){ R=R||1500; ms=ms||0; const t0=performance.now(); let any=false, nb=0;
  for(;;){ const t0x=Math.floor((px-R)/TS), t1x=Math.floor((px+R)/TS), t0z=Math.floor((pz-R)/TS), t1z=Math.floor((pz+R)/TS); let best=null,bd=1e18;
    for(let tx=t0x;tx<=t1x;tx++) for(let tz=t0z;tz<=t1z;tz++){ if(TILES.has(tk(tx,tz))) continue; if(Math.abs(tx*TS)>BX+TS||Math.abs(tz*TS)>BZ+TS) continue; const d=Math.hypot((tx+.5)*TS-px,(tz+.5)*TS-pz); if(d<bd){ bd=d; best=[tx,tz]; } }
    if(!best) return any; bake(best[0],best[1]); any=true; if(++nb>=1||performance.now()-t0>=ms) return true; } }
/* circular exclusion zones (scenery plazas): no lots, no roads, no voxel ground */
const EXCL=[[1839,111,175]];
function excl(x,z,pad){ for(let i=0;i<EXCL.length;i++){ const e=EXCL[i]; if(Math.hypot(x-e[0],z-e[1])<e[2]+pad) return true; } return false; }
const LOTC=new Map();
const API={EXCL,excl,prefetch,cls,CELL,WATERDH,BX,BZ,R0,R1,exact,h,land:landField,riverQuery,hillR,hillH,RIVERS,MASSIFS,BLOBS,SEGS,
  inBounds:(x,z)=>x>-BX&&x<BX&&z>-BZ&&z<BZ,
  flatAt:(x,z)=>Math.abs(h(x,z))<.02,
  /* a lot / block of roads may be built when the whole footprint is flat dry plateau */
  lotOK(cx,cz,r){ r=r||30; const key=cx*131071+cz*7+r; let v=LOTC.get(key); if(v===undefined){ v=API.lotOK0(cx,cz,r); if(LOTC.size>20000) LOTC.clear(); LOTC.set(key,v); } return v; },
  lotOK0(cx,cz,r){ if(excl(cx,cz,r)) return false; return Math.abs(h(cx,cz))<.02&&Math.abs(h(cx-r,cz-r))<.02&&Math.abs(h(cx+r,cz-r))<.02&&Math.abs(h(cx-r,cz+r))<.02&&Math.abs(h(cx+r,cz+r))<.02&&Math.abs(h(cx,cz-r))<.02&&Math.abs(h(cx,cz+r))<.02&&Math.abs(h(cx-r,cz))<.02&&Math.abs(h(cx+r,cz))<.02; },
  /* roads continue over rivers (as bridges) but stop at hills and beaches */
  roadZone(x,z){ return !excl(x,z,0)&&hillR(x,z)<R0+40&&landField(x,z)>.034&&Math.abs(x)<BX-200&&Math.abs(z)<BZ-200; },
  isRiver(x,z){ const q=riverQuery(x,z); return !!q&&q.d<14; },
  slope(x,z){ const e=4; return Math.hypot(h(x+e,z)-h(x-e,z),h(x,z+e)-h(x,z-e))/(2*e); },
  tilesBaked:()=>TILES.size,
};
if(typeof window!=="undefined") window.TERR=API;
if(typeof module!=='undefined') module.exports=API;
})();
