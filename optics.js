export const wavelength = 0.000532;
export function initial(s) { return {a:0,b:Math.PI*(s.diameter/2)**2/(wavelength*s.m2)}; }
export function refract(q,f) {
  const u=1-q.a/f,v=-q.b/f,d=u*u+v*v;
  return {a:(q.a*u+q.b*v)/d,b:(q.b*u-q.a*v)/d};
}
export function qAt(s,z,axis) {
  let q=initial(s),last=0;
  s.lenses.filter(l=>l.enabled!==false&&l.z<=z).slice().sort((a,b)=>a.z-b.z).forEach(l=>{
    q.a+=l.z-last;last=l.z;
    if(l.type===axis||l.type==='sphere')q=refract(q,l.f);
  });q.a+=z-last;return q;
}
export function diameter(q,s) { return 2*Math.sqrt(wavelength*s.m2/Math.PI*(q.a*q.a+q.b*q.b)/q.b); }
export function sizeAt(s,z) {return {width:diameter(qAt(s,z,'x'),s),thickness:diameter(qAt(s,z,'y'),s)};}
export function design(s,target) {
  const z1=s.end*.16,z2=s.end*.2,L=s.end-z2,q=initial(s);q.a=z2;
  const w=diameter(q,s)/2,lower=(wavelength*s.m2*L/Math.PI/w)**2;
  if((target/2)**2<=lower)throw new Error('此束径和距离下，单片厚度镜无法达到目标。请增大束径或缩短距离。');
  const inv=q.a/(q.a*q.a+q.b*q.b)+(1-Math.sqrt(((target/2)**2-lower)/(w*w)))/L;
  return [{id:1,type:'x',z:z1,f:-10,aperture:12.7,enabled:true},{id:2,type:'y',z:z2,f:Math.abs(inv)<1e-6?1000000:1/inv,aperture:25.4,enabled:true}];
}
