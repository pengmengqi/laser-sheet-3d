import {radii,surfaceAt} from './shapes.js';
export const dimColors={aperture:'#b2f39b',height:'#b2f39b',thickness:'#f6cf83',r1:'#8ddaf8',r2:'#f3ae91'};
export function formatMm(value){return Math.abs(value)>=10000?value.toExponential(2):Number(value.toFixed(3)).toString();}
export function dimensionModel(l){
 const width=l.aperture,height=l.outline==='rectangle'?l.height:width,r=radii(l)||{r1:0,r2:0};
 const sample=l.type==='y'?{x:0,y:height*.24}:{x:width*.24,y:0},p=surfaceAt(l,sample.x,sample.y);
 return {width,height,front:p.front,back:p.back,sample,r,
  labels:{aperture:`${l.outline==='circle'?'直径 D':'宽度 X'} = ${formatMm(width)} mm`,height:`高度 Y = ${formatMm(height)} mm`,thickness:`中心厚度 CT = ${formatMm(l.thickness)} mm`,r1:`R1 前表面 = ${r.r1===0?'平面':formatMm(r.r1)+' mm'}`,r2:`R2 后表面 = ${r.r2===0?'平面':formatMm(r.r2)+' mm'}`}};
}
