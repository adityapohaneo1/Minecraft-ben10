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
/* ---- the world is modelled on the supplied map picture (www/mapdata.js): signed-distance grids for land and city, a greenery grid and road polylines ---- */
const GM=(typeof window!=="undefined"&&window.__MAP)||(typeof globalThis!=="undefined"&&globalThis.__MAP)||null;
const B64=(()=>{ const t=new Int16Array(128).fill(-1), c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; for(let i=0;i<64;i++) t[c.charCodeAt(i)]=i; return t; })();
function u8(b64,Cls){ let n=b64.length, pad=b64.charCodeAt(n-1)===61?(b64.charCodeAt(n-2)===61?2:1):0, len=(n/4)*3-pad, a=new Cls(len), o=0;
  for(let i=0;i<n;i+=4){ const v=(B64[b64.charCodeAt(i)]<<18)|(B64[b64.charCodeAt(i+1)]<<12)|((B64[b64.charCodeAt(i+2)]&63)<<6)|(B64[b64.charCodeAt(i+3)]&63); for(let k=0;k<3&&o<len;k++){ const c=(v>>(16-8*k))&255; a[o++]=Cls===Int8Array&&c>127?c-256:c; } } return a; }
const MW=GM?GM.W:2, MH=GM?GM.H:2, MU=GM?GM.U:20.2, MOX=GM?GM.ox:0, MOY=GM?GM.oy:0;
const MLAND=GM?u8(GM.land,Int8Array):new Int8Array(4), MEDGE=GM?u8(GM.edge,Int8Array):new Int8Array(4), MURB=GM?u8(GM.urb,Int8Array):new Int8Array(4).fill(-100), MBIO=GM?u8(GM.bio,Uint8Array):new Uint8Array(4);
const BX=MW/2*MU, BZ=MH/2*MU;              // playable rectangle (the sea fills what the land does not)
function mapS(A,x,z,sc){ let px=x/MU+MW/2-.5, py=z/MU+MH/2-.5; px=px<0?0:px>MW-1.001?MW-1.001:px; py=py<0?0:py>MH-1.001?MH-1.001:py;
  const ix=px|0, iy=py|0, fx=px-ix, fy=py-iy, o=iy*MW+ix, a=A[o], b=A[o+1], c=A[o+MW], d=A[o+MW+1]; return (a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy)/sc; }
const px2w=(px,py)=>[(px+MOX-MW/2)*MU,(py+MOY-MH/2)*MU];       // picture pixel -> world (the big city centre is the origin)
function hs(ix,iz,s){ let h=(Math.imul(ix|0,374761393)+Math.imul(iz|0,668265263)+Math.imul(s|0,2147483629))|0; h=Math.imul(h^(h>>>15),2246822519); h=Math.imul(h^(h>>>13),3266489917); return ((h^(h>>>16))>>>0)/4294967296; }
function vn(x,z,s){ const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz, ux=fx*fx*(3-2*fx), uz=fz*fz*(3-2*fz);
  const a=hs(ix,iz,s), b=hs(ix+1,iz,s), c=hs(ix,iz+1,s), d=hs(ix+1,iz+1,s); return a+(b-a)*ux+(c-a)*uz+(a-b-c+d)*ux*uz; }
function fbm(x,z,s,o){ let a=.5,f=1,t=0,n=0; for(let i=0;i<o;i++){ t+=a*vn(x*f,z*f,s+i*17); n+=a; a*=.5; f*=2.03; } return t/n; }
const sm=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };

/* ---- land: signed distance to the coast (map pixels -> world units / 3000, so beaches keep their old proportions) + coastline wobble ---- */
function landField(x,z){
  return mapS(MLAND,x,z,1)*MU/1000+.012*(fbm(x/120,z/120,3,3)-.5)*2+.004*(vn(x/40,z/40,9)-.5);
}

/* ---- rivers: control points -> smoothed polyline -> bucketed segments ---- */
const RIVERS=[];
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

const R0=0, R1=1000;                  // city plateau radius / full hill amplitude radius (distorted by noise)
/* hill field: <R0 inside the city (dead flat), rises with distance from the city edge */
function hillR(x,z){ return -1e6; }   // hills only in a band along the coast; the whole interior is flat
const MASSIFS=[[167,160,250,470],[58,78,150,360],[100,232,170,420],[228,68,130,430],[330,30,110,380],[20,200,120,360],[330,255,90,330],[395,282,70,300]].map(m=>{ const w=px2w(m[0],m[1]); return [w[0],w[1],m[2],m[3]]; }).slice(0,0);
const FLAT=[];
function hillH(x,z,HR){
  const u=sm(R0,R1,HR===undefined?hillR(x,z):HR); if(u<=0) return 0;
  let fl=1; for(let i=0;i<FLAT.length;i++){ const d=Math.hypot(x-FLAT[i][0],z-FLAT[i][1]); if(d<260) fl=Math.min(fl,sm(110,260,d)); } if(fl<=0) return 0;
  const n=fbm(x/430,z/430,5,5), r=1-Math.abs(2*fbm(x/700+9,z/700,8,3)-1);
  let h=u*(18+90*n*n+44*r*r);
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
const EXCL=[];
function excl(x,z,pad){ for(let i=0;i<EXCL.length;i++){ const e=EXCL[i]; if(Math.hypot(x-e[0],z-e[1])<e[2]+pad) return true; } return false; }
const LOTC=new Map();
/* ---- map roads: smoothed polylines (curves, not a grid) + a spatial index for "how far is the nearest road" ---- */
const RL=[], RB=new Map(), RBS=96, RSTEP=8;
(function(){ if(!GM) return;
  const chaikin=(P,it)=>{ for(let k=0;k<it;k++){ const o=[P[0]]; for(let i=0;i<P.length-1;i++){ const a=P[i],b=P[i+1]; o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]); } o.push(P[P.length-1]); P=o; } return P; };
  const resample=P=>{ const out=[P[0].slice()]; let acc=0; for(let i=0;i<P.length-1;i++){ const a=P[i],b=P[i+1], d=Math.hypot(b[0]-a[0],b[1]-a[1]); if(d<1e-6) continue; let t=(RSTEP-acc)/d; while(t<=1){ out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]); t+=RSTEP/d; } acc=(1-(t-RSTEP/d))*d; if(acc>=RSTEP) acc=0; } out.push(P[P.length-1].slice()); return out; };
  GM.roads.forEach((r,i)=>{ const th=r[0], src=r[1].map(p=>[(p[0]-MW/2)*MU,(p[1]-MH/2)*MU]); if(src.length<2) return;
    const pts=resample(chaikin(src,2)); let len=0; for(let k=1;k<pts.length;k++) len+=Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]);
    const tw=th*MU, w=r[2]||Math.max(3.6,Math.min(9,tw*.26)), major=w>=6.4; const L={pts,w,major,len,id:RL.length,tar:true};
    L.mx=pts[pts.length>>1][0]; L.mz=pts[pts.length>>1][1];
    for(let k=0;k<pts.length-1;k++){ const a=pts[k], b=pts[k+1], x0=Math.floor((Math.min(a[0],b[0])-w-40)/RBS), x1=Math.floor((Math.max(a[0],b[0])+w+40)/RBS), z0=Math.floor((Math.min(a[1],b[1])-w-40)/RBS), z1=Math.floor((Math.max(a[1],b[1])+w+40)/RBS), sg={L,k,ax:a[0],az:a[1],bx:b[0],bz:b[1]};
      for(let X=x0;X<=x1;X++) for(let Z=z0;Z<=z1;Z++){ const key=X+','+Z; let l=RB.get(key); if(!l) RB.set(key,l=[]); l.push(sg); } }
    RL.push(L); });
})();
/* nearest road: {d: distance to the centre line, w: its half width, L, k} or null within 40 units of the edge */
function roadQuery(x,z,ex){ const l=RB.get(Math.floor(x/RBS)+','+Math.floor(z/RBS)); if(!l) return null; let bd=1e9,bs=null;
  for(let i=0;i<l.length;i++){ const s=l[i]; if(ex&&s.L===ex) continue; const dx=s.bx-s.ax, dz=s.bz-s.az, t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(dx*dx+dz*dz))), d=Math.hypot(x-s.ax-dx*t,z-s.az-dz*t)-s.L.w; if(d<bd){ bd=d; bs=s; } }
  return bs?{d:bd,L:bs.L,k:bs.k}:null; }
const API={bio:(x,z)=>Math.max(mapS(MBIO,x,z,255),.55*sm(0,500,hillR(x,z))),urb:(x,z)=>mapS(MURB,x,z,1)*MU,RLINES:RL,roadQuery,roadDist:(x,z)=>{ const q=roadQuery(x,z); return q?q.d:1e9; },px2w,EXCL,excl,prefetch,cls,CELL,WATERDH,BX,BZ,R0,R1,exact,h,land:landField,riverQuery,hillR,hillH,RIVERS,MASSIFS,SEGS,
  inBounds:(x,z)=>{ const C=typeof window!=='undefined'&&window.__CITY; if(C){ const b=C.bounds; return x>b[0]-3&&x<b[2]+3&&z>b[1]-3&&z<b[3]+3; } return x>-BX&&x<BX&&z>-BZ&&z<BZ; },
  flatAt:(x,z)=>Math.abs(h(x,z))<.02,
  /* a lot / block of roads may be built when the whole footprint is flat dry plateau */
  lotOK(cx,cz,r){ r=r||30; const key=cx*131071+cz*7+r; let v=LOTC.get(key); if(v===undefined){ v=API.lotOK0(cx,cz,r); if(LOTC.size>20000) LOTC.clear(); LOTC.set(key,v); } return v; },
  flatOK(cx,cz,r){ const key=-(cx*131071+cz*7+r); let v=LOTC.get(key); if(v===undefined){ v=API.lotOK0(cx,cz,r,true); if(LOTC.size>20000) LOTC.clear(); LOTC.set(key,v); } return v; },
  lotOK0(cx,cz,r,noRoad){ return false; if(excl(cx,cz,r)) return false; if(!noRoad){ const q=roadQuery(cx,cz); if(q&&q.d<9) return false; if(mapS(MURB,cx,cz,1)*MU<-6) return false; } return Math.abs(h(cx,cz))<.02&&Math.abs(h(cx-r,cz-r))<.02&&Math.abs(h(cx+r,cz-r))<.02&&Math.abs(h(cx-r,cz+r))<.02&&Math.abs(h(cx+r,cz+r))<.02&&Math.abs(h(cx,cz-r))<.02&&Math.abs(h(cx,cz+r))<.02&&Math.abs(h(cx-r,cz))<.02&&Math.abs(h(cx+r,cz))<.02; },
  /* roads continue over rivers (as bridges) but stop at hills and beaches */
  roadZone(x,z){ return false; },
  isRiver(x,z){ const q=riverQuery(x,z); return !!q&&q.d<14; },
  slope(x,z){ const e=4; return Math.hypot(h(x+e,z)-h(x-e,z),h(x,z+e)-h(x,z-e))/(2*e); },
  tilesBaked:()=>TILES.size,
};
if(typeof window!=="undefined") window.TERR=API;
if(typeof module!=='undefined') module.exports=API;
})();
