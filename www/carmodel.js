/* CARM - the supplied low-poly cars (cardata.js + textures/cars.jpg atlas). Each is a single mesh so the game's damage/flash code keeps working on its material. */
(function(){
const D=window.__CARS; if(!D||!window.THREE) return; const T=THREE; const geos=[];
const dec=(s,C)=>{ const b=atob(s), u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return new C(u.buffer); };
const tex=new T.TextureLoader().load('textures/cars.jpg'); tex.anisotropy=4;
function geoOf(i){ if(geos[i]) return geos[i]; const c=D[i], g=new T.BufferGeometry(), p=dec(c.pos,Int16Array), P=new Float32Array(p.length), N=new Float32Array(p.length), n8=dec(c.nor,Int8Array);
  for(let k=0;k<p.length;k+=3){ P[k]=-p[k]/1000; P[k+1]=p[k+1]/1000; P[k+2]=-p[k+2]/1000; N[k]=-n8[k]/127; N[k+1]=n8[k+1]/127; N[k+2]=-n8[k+2]/127; }   // front faces -z like the game's cars
  g.setAttribute('position',new T.BufferAttribute(P,3)); g.setAttribute('normal',new T.BufferAttribute(N,3)); g.setAttribute('uv',new T.BufferAttribute(dec(c.uv,Float32Array),2)); g.setIndex(new T.BufferAttribute(dec(c.idx,Uint16Array),1)); g.computeBoundingSphere(); return (geos[i]=g); }
// local units of a car group: length 2.1, ground at y=-.5
window.CARM={ n:D.length, make(i){ const c=D[i%D.length], k=2.1/c.L, m=new T.Mesh(geoOf(i%D.length),new T.MeshLambertMaterial({map:tex})); m.scale.setScalar(k); m.position.y=-.5; m.castShadow=true; return m; } };
})();
