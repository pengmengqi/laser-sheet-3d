export const shapeNames={planoConvex:'平凸',biconvex:'双凸',planoConcave:'平凹',biconcave:'双凹',meniscus:'弯月',custom:'自定义曲面'};
export function normalizeLens(l){
 return {...l,mode:l.mode||'focal',form:l.form||(l.f<0?'biconcave':'biconvex'),outline:l.outline||'circle',height:l.height??l.aperture,thickness:l.thickness??3,n:l.n??1.52,r1:l.r1??0,r2:l.r2??0};
}
export function presetRadii(l,form=l.form){
 const r=Math.max(l.aperture,l.outline==='rectangle'?l.height:0,Math.abs(l.f)*(l.n-1)*2,10);
 if(form==='planoConvex')return {r1:r,r2:0};
 if(form==='planoConcave')return {r1:-r,r2:0};
 if(form==='biconcave')return {r1:-r,r2:r};
 if(form==='meniscus')return {r1:r,r2:2*r};
 return {r1:r,r2:-r};
}
export function focalRadii(l){
 const k=l.n-1,p=1/l.f,t=l.thickness;
 if(l.form==='planoConvex'||l.form==='planoConcave')return {r1:k/p,r2:0};
 if(l.form==='meniscus'){
  // R2=2 R1. Solve p R1² -(k/2) R1 - k² t/(2n)=0.
  const a=p,b=-k/2,c=-k*k*t/(2*l.n),disc=b*b-4*a*c;
  if(disc<0)return null;
  const roots=[(-b+Math.sqrt(disc))/(2*a),(-b-Math.sqrt(disc))/(2*a)];
  const r=roots.filter(v=>Math.sign(v)===Math.sign(l.f)).sort((a,b)=>Math.abs(b)-Math.abs(a))[0];
  return r?{r1:r,r2:2*r}:null;
 }
 // R2=-R1. p R1² -2k R1 + k² t/n =0.
 const disc=k*k-p*k*k*t/l.n;if(disc<0)return null;
 const r=(k+Math.sqrt(disc))/p;return {r1:r,r2:-r};
}
export function radii(l){return l.mode==='curvature'?{r1:l.r1,r2:l.r2}:focalRadii(l);}
export function focalLength(l){const r=radii(l);if(!r)return NaN;const a=r.r1===0?0:1/r.r1,b=r.r2===0?0:1/r.r2,k=l.n-1,p=k*(a-b+k*l.thickness*a*b/l.n);return Math.abs(p)<1e-12?Infinity:1/p;}
export function sag(r,h){if(r===0)return 0;return h*h/(r+Math.sign(r)*Math.sqrt(Math.max(0,r*r-h*h)));}
export function surfaceAt(l,x,y){const r=radii(l);if(!r)return {front:-l.thickness/2,back:l.thickness/2};const h=l.type==='sphere'?Math.hypot(x,y):Math.abs(l.type==='x'?x:y);return {front:-l.thickness/2+sag(r.r1,h),back:l.thickness/2+sag(r.r2,h)};}
export function shapeIssue(l){
 const r=radii(l);if(!r)return '该焦距与厚度没有所选形状的实数曲率解';
 const h=l.type==='sphere'?(l.outline==='circle'?l.aperture/2:Math.hypot(l.aperture,l.height)/2):l.type==='x'?l.aperture/2:(l.outline==='rectangle'?l.height:l.aperture)/2;
 if([r.r1,r.r2].some(v=>v!==0&&Math.abs(v)<=h))return '曲率半径不足以覆盖口径，请减小口径或增大半径';
 const edge=surfaceAt(l,l.type==='y'?0:h,l.type==='y'?h:0);
 if(edge.back-edge.front<=.05)return '两曲面在口径内相交，请增大中心厚度或减小口径';
 return '';
}
export function shapeValid(l){return ['focal','curvature'].includes(l.mode)&&Object.hasOwn(shapeNames,l.form)&&['circle','rectangle'].includes(l.outline)&&Number.isFinite(l.height)&&l.height>=1&&l.height<=150&&Number.isFinite(l.thickness)&&l.thickness>=.1&&l.thickness<=100&&Number.isFinite(l.n)&&l.n>=1.1&&l.n<=2.5&&[l.r1,l.r2].every(r=>Number.isFinite(r)&&Math.abs(r)<=1e7&&(r===0||Math.abs(r)>=.1));}
