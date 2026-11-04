import * as THREE from 'three';
import {OrbitControls} from './OrbitControls.js';
import {sizeAt,design} from './optics.js';
import {normalizeLens,shapeNames,presetRadii,radii,focalLength,surfaceAt,shapeIssue,shapeValid} from './shapes.js';
import {dimensionModel,dimColors,formatMm} from './dimensions.js';
const $=s=>document.querySelector(s), storageKey='laser-sheet-3d-v1';
let state={diameter:1,m2:1,end:500,target:.75,enhance:true,rays:true,lenses:[]};
state.lenses=design(state,.75);
function valid(s){return s&&Number.isFinite(s.diameter)&&s.diameter>=.1&&s.diameter<=20&&Number.isFinite(s.m2)&&s.m2>=1&&s.m2<=10&&Number.isFinite(s.end)&&s.end>=150&&s.end<=3000&&Number.isFinite(s.target)&&s.target>=.5&&s.target<=2&&typeof s.enhance==='boolean'&&typeof s.rays==='boolean'&&Array.isArray(s.lenses)&&s.lenses.length<=12&&s.lenses.every(l=>['x','y','sphere'].includes(l.type)&&Number.isFinite(l.z)&&l.z>=0&&l.z<=3000&&Number.isFinite(l.f)&&Math.abs(l.f)>=1&&Math.abs(l.f)<=1e12&&Number.isFinite(l.aperture)&&l.aperture>=1&&l.aperture<=150&&typeof l.enabled==='boolean'&&shapeValid(normalizeLens(l)));}
try{const s=JSON.parse(localStorage.getItem(storageKey));if(valid(s))state=s;}catch{}
state.lenses=state.lenses.map(normalizeLens);
let selected=0,currentView='perspective',renderer,scene,camera,orbit,opticalGroup,beamGroup,pickables=[],activeDimension=null;
const stage=$('#stage'),canvas=$('#scene');
function notify(message){$('#notice').textContent=message;$('#notice').hidden=!message;}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}}
function scales(){return state.enhance?{w:3,t:30}:{w:1,t:1};}
function point(z,x=0,y=0){const s=scales();return new THREE.Vector3(z,y*s.t,x*s.w);}
function dispose(group){while(group.children.length){const child=group.children[0];group.remove(child);child.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});}}
function line(points,color,opacity=1){const geo=new THREE.BufferGeometry().setFromPoints(points);return new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));}
function label(text,pos,color='#dce8dc',scale=1){const cv=document.createElement('canvas');cv.width=512;cv.height=112;const c=cv.getContext('2d');c.fillStyle=color;c.font='38px system-ui';c.textAlign='center';c.fillText(text,256,65);const texture=new THREE.CanvasTexture(cv),m=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}),sprite=new THREE.Sprite(m);sprite.position.copy(pos);sprite.scale.set(72*scale,15.75*scale,1);return sprite;}
function init(){try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x0e1611,0);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.1,20000);orbit=new OrbitControls(camera,canvas);orbit.enableDamping=false;orbit.minDistance=10;orbit.maxDistance=10000;orbit.addEventListener('change',render);scene.add(new THREE.AmbientLight(0xc6e7cd,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(200,400,300);scene.add(light);opticalGroup=new THREE.Group();beamGroup=new THREE.Group();scene.add(opticalGroup,beamGroup);new ResizeObserver(resize).observe(stage);canvas.addEventListener('pointerdown',e=>{canvas.dataset.px=e.clientX;canvas.dataset.py=e.clientY;});canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-Number(canvas.dataset.px),e.clientY-Number(canvas.dataset.py))>5)return;const b=canvas.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(pickables)[0];if(hit){selected=hit.object.userData.index;renderLenses();build();drawProfile();if(currentView==='lens')view();}});}
catch(e){$('#webgl-error').hidden=false;$('#webgl-error').textContent='3D 渲染未能启动，请在支持 WebGL 的浏览器中打开。参数计算和透镜编辑仍可使用。';}}
function resize(){if(!renderer)return;renderer.setSize(stage.clientWidth,stage.clientHeight,false);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();render();drawCross();drawProfile();}
function render(){if(renderer&&scene&&camera){applyFocus();renderer.render(scene,camera);drawDimensions();}}
function drawObservationDimensions(svg){
 const W=stage.clientWidth,H=stage.clientHeight,o=sizeAt(state,state.end),F=o.thickness*Math.sqrt(Math.log(2)/2),colors={width:'#b2f39b',thickness:'#8ddaf8',fwhm:'#f3ae91'};
 svg.removeAttribute('hidden');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const project=(x,y)=>{const p=point(state.end,x,y).project(camera);return {x:(p.x+1)*W/2,y:(1-p.y)*H/2};};
 const path=(ps,key,dash=false)=>`<polyline class="dim-line" points="${ps.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')}" stroke="${colors[key]}" ${dash?'stroke-dasharray="3 4"':''}/>`;
 function dimension(a,b,key){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,n={x:-dy/len*5,y:dx/len*5};return path([a,b],key)+[a,b].map(p=>path([{x:p.x-n.x,y:p.y-n.y},{x:p.x+n.x,y:p.y+n.y}],key)).join('');}
 function tag(key,title,value,x,y,anchor){const width=Math.min(190,W*.47),edge={x:x<W/2?x+width:x,y:y+20};return path([anchor,edge],key,true)+`<rect class="dim-box" x="${x}" y="${y}" width="${width}" height="44" rx="5"/><text x="${x+8}" y="${y+17}" fill="${colors[key]}">${title}</text><text x="${x+8}" y="${y+35}" fill="${colors[key]}">${formatMm(value)} mm</text>`;}
 const wx1=project(-o.width/2,-o.thickness*.8),wx2=project(o.width/2,-o.thickness*.8),ty1=project(o.width*.65,-o.thickness/2),ty2=project(o.width*.65,o.thickness/2),fy1=project(-o.width*.65,-F/2),fy2=project(-o.width*.65,F/2);
 let content=dimension(wx1,wx2,'width')+dimension(ty1,ty2,'thickness')+dimension(fy1,fy2,'fwhm');
 content+=path([project(-o.width/2,0),wx1],'width',true)+path([project(o.width/2,0),wx2],'width',true);
 content+=tag('fwhm','厚度 FWHM · 50%',F,12,112,{x:(fy1.x+fy2.x)/2,y:(fy1.y+fy2.y)/2});
 content+=tag('thickness','厚度 1/e² · 13.5%',o.thickness,W-Math.min(190,W*.47)-12,112,{x:(ty1.x+ty2.x)/2,y:(ty1.y+ty2.y)/2});
 content+=tag('width','片宽 X · 1/e²',o.width,(W-Math.min(190,W*.47))/2,H-115,{x:(wx1.x+wx2.x)/2,y:(wx1.y+wx2.y)/2});
 content+=`<text x="14" y="${H-46}" fill="#c1d2c2">数值为实际尺寸 · 可关闭横向放大查看真实比例</text>`;svg.innerHTML=content;
}
function drawDimensions(){
 const svg=$('#dimension-overlay'),l=state.lenses[selected];
 if(currentView==='end'){drawObservationDimensions(svg);return;}
 const hide=currentView!=='lens'||!l||!l.enabled||l.z>state.end||!!shapeIssue(l);svg.toggleAttribute('hidden',hide);if(hide){svg.replaceChildren();return;}
 const W=stage.clientWidth,H=stage.clientHeight,sc=scales().w,d=dimensionModel(l),w=d.width,h=d.height,t=l.thickness;
 svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const project=(z,x,y)=>{const p=new THREE.Vector3(l.z+z*sc,y*sc,x*sc).project(camera);return {x:(p.x+1)*W/2,y:(1-p.y)*H/2};};
 const P=(x,y)=>`${x.toFixed(1)},${y.toFixed(1)}`;
 const path=(points,key,dashed=false)=>`<polyline class="dim-line ${activeDimension===key?'dim-active':''}" points="${points.map(p=>P(p.x,p.y)).join(' ')}" stroke="${dimColors[key]}" ${dashed?'stroke-dasharray="3 4"':''}/>`;
 const dot=(p,key)=>`<circle cx="${p.x}" cy="${p.y}" r="3" fill="${dimColors[key]}"/>`;
 const labelW=Math.min(W*.47,190),left=12,right=W-labelW-12;
 function note(key,x,y,anchor){const end={x:x===left?x+labelW:x,y:y+21};return path([anchor,end],key,true)+dot(anchor,key)+`<rect class="dim-box" x="${x}" y="${y}" width="${labelW}" height="42" rx="5"/><text x="${x+8}" y="${y+16}" fill="${dimColors[key]}">${d.labels[key].split('=')[0].trim()}</text><text x="${x+8}" y="${y+33}" fill="${dimColors[key]}">${d.labels[key].split('=')[1].trim()}</text>`;}
 function measure(a,b,key){const pa=project(...a),pb=project(...b),dx=pb.x-pa.x,dy=pb.y-pa.y,len=Math.hypot(dx,dy)||1,nx=-dy/len*5,ny=dx/len*5;return {mid:{x:(pa.x+pb.x)/2,y:(pa.y+pb.y)/2},svg:path([pa,pb],key)+path([{x:pa.x-nx,y:pa.y-ny},{x:pa.x+nx,y:pa.y+ny}],key)+path([{x:pb.x-nx,y:pb.y-ny},{x:pb.x+nx,y:pb.y+ny}],key)};}
 let out='';
 const diam=measure([0,-w/2,-h*.65],[0,w/2,-h*.65],'aperture');out+=diam.svg+path([project(0,-w/2,0),project(0,-w/2,-h*.65)],'aperture',true)+path([project(0,w/2,0),project(0,w/2,-h*.65)],'aperture',true);out+=note('aperture',left,H-110,diam.mid);
 if(l.outline==='rectangle'){const ht=measure([0,-w*.65,-h/2],[0,-w*.65,h/2],'height');out+=ht.svg+path([project(0,-w/2,-h/2),project(0,-w*.65,-h/2)],'height',true)+path([project(0,-w/2,h/2),project(0,-w*.65,h/2)],'height',true)+note('height',left,112,ht.mid);}
 const ct=measure([-t/2,0,0],[t/2,0,0],'thickness');out+=ct.svg+note('thickness',right,H-74,ct.mid);
 out+=note('r1',right,112,project(d.front,d.sample.x,d.sample.y));
 const q=surfaceAt(l,-d.sample.x,-d.sample.y);out+=note('r2',right,160,project(q.back,-d.sample.x,-d.sample.y));
 out+=`<text x="14" y="${H-47}" fill="#c1d2c2">标注为实际尺寸 · 镜片显示 ×${sc}</text>`;
 svg.innerHTML=out;
}
function applyFocus(){if(!opticalGroup)return;for(const obj of opticalGroup.children)obj.visible=currentView==='lens'?obj.userData.lensIndex===selected:currentView==='end'?!!obj.userData.observation:true;beamGroup.visible=currentView!=='lens';for(const obj of beamGroup.children)obj.visible=currentView!=='end'||!!obj.userData.observationContour;}
function view(name=currentView){currentView=name;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(!renderer)return;const L=state.end,center=new THREE.Vector3(L/2,0,0),extent=Math.max(L*.92,sizeAt(state,L).width*scales().w);orbit.target.copy(center);camera.up.set(0,1,0);if(name==='lens'&&state.lenses[selected]){const l=state.lenses[selected],d=Math.max(l.aperture,l.height,l.thickness)*scales().w;orbit.target.set(l.z,0,0);camera.position.set(l.z+d*1.5,d*.8,d*1.4);}else if(name==='top'){camera.position.set(L/2,extent*1.8,0);camera.up.set(-1,0,0);}else if(name==='side'){camera.position.set(L/2,0,extent*1.8);}else if(name==='end'){const span=Math.max(sizeAt(state,L).width*scales().w,sizeAt(state,L).thickness*scales().t);const distance=Math.max(10,span/Math.min(camera.aspect,1)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.65);camera.position.set(L+distance,0,0);orbit.target.set(L,0,0);}else camera.position.set(L*.98,extent*.65,extent*.95);camera.lookAt(orbit.target);applyFocus();orbit.update();render();}
function lensGeometry(l,visualScale){
 const N=30,positions=[],indices=[],stride=N+1,layer=stride*stride;
 for(let side=0;side<2;side++)for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){
  const u=i/N*2-1,v=j/N*2-1;
  const x=(l.outline==='circle'?u*Math.sqrt(1-v*v/2):u)*l.aperture/2;
  const y=(l.outline==='circle'?v*Math.sqrt(1-u*u/2):v)*(l.outline==='rectangle'?l.height:l.aperture)/2;
  const p=surfaceAt(l,x,y);positions.push((side?p.back:p.front)*visualScale,y*visualScale,x*visualScale);
 }
 for(let side=0;side<2;side++)for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=side*layer+j*stride+i,b=a+1,c=a+stride,d=c+1;indices.push(a,b,c,b,d,c);}
 const boundary=[];for(let i=0;i<N;i++)boundary.push(i);for(let j=0;j<N;j++)boundary.push(j*stride+N);for(let i=N;i>0;i--)boundary.push(N*stride+i);for(let j=N;j>0;j--)boundary.push(j*stride);
 boundary.forEach((a,i)=>{const b=boundary[(i+1)%boundary.length];indices.push(a,b,a+layer,b,b+layer,a+layer);});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function drawProfile(){
 const cv=$('#lens-profile');if(!cv)return;const W=cv.clientWidth,H=270,ratio=Math.min(devicePixelRatio,2);cv.width=W*ratio;cv.height=H*ratio;const c=cv.getContext('2d');c.scale(ratio,ratio);const l=state.lenses[selected];if(!l)return;
 c.font='12px system-ui';c.fillStyle='#c6d7c9';c.fillText(`L${selected+1} · ${shapeNames[l.form]} · ${l.type==='sphere'?'球面':'柱面'}`,12,20);
 const issue=shapeIssue(l);if(issue){c.fillStyle='#f5cc8a';c.fillText('外形不可构成：请调整口径、厚度或曲率',12,65);return;}
 const d=dimensionModel(l),aperture=l.type==='y'?d.height:d.width,pts=Array.from({length:81},(_,i)=>{const h=(i/80-.5)*aperture,p=surfaceAt(l,l.type==='y'?0:h,l.type==='y'?h:0);return {h,...p};}),min=Math.min(...pts.map(p=>p.front)),max=Math.max(...pts.map(p=>p.back)),s=Math.min(W*.32/Math.max(max-min,1),150/aperture),xp=x=>W/2+(x-(min+max)/2)*s,yp=h=>136-h*s;
 const stroke=(pts,key,dash=false)=>{c.strokeStyle=dimColors[key]||'#556b59';c.lineWidth=activeDimension===key?2:1;c.setLineDash(dash?[3,4]:[]);c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();c.setLineDash([]);};
 const mark=(x,y,key)=>{c.fillStyle=dimColors[key];c.beginPath();c.arc(x,y,2.5,0,Math.PI*2);c.fill();};
 stroke([[Math.max(10,xp(min)-40),yp(0)],[Math.min(W-10,xp(max)+40),yp(0)]],null,true);
 c.fillStyle='rgba(178,243,155,.18)';c.beginPath();pts.forEach((p,i)=>i?c.lineTo(xp(p.front),yp(p.h)):c.moveTo(xp(p.front),yp(p.h)));pts.slice().reverse().forEach(p=>c.lineTo(xp(p.back),yp(p.h)));c.closePath();c.fill();
 stroke(pts.map(p=>[xp(p.front),yp(p.h)]),'r1');stroke(pts.map(p=>[xp(p.back),yp(p.h)]),'r2');stroke([[xp(pts[0].front),yp(pts[0].h)],[xp(pts[0].back),yp(pts[0].h)]],null);stroke([[xp(pts.at(-1).front),yp(pts.at(-1).h)],[xp(pts.at(-1).back),yp(pts.at(-1).h)]],null);
 const h=aperture*.28,p=surfaceAt(l,l.type==='y'?0:h,l.type==='y'?h:0),back=surfaceAt(l,l.type==='y'?0:-h,l.type==='y'?-h:0);
 const leftLabel=12,rightLabel=W-12;c.textAlign='left';c.fillStyle=dimColors.r1;c.fillText('R1 · 前表面曲率',leftLabel,43);c.fillText(d.r.r1===0?'平面（R1＝0）':formatMm(d.r.r1)+' mm',leftLabel,60);stroke([[leftLabel+55,65],[xp(p.front),yp(h)]],'r1',true);mark(xp(p.front),yp(h),'r1');
 c.textAlign='right';c.fillStyle=dimColors.r2;c.fillText('R2 · 后表面曲率',rightLabel,43);c.fillText(d.r.r2===0?'平面（R2＝0）':formatMm(d.r.r2)+' mm',rightLabel,60);stroke([[rightLabel-55,65],[xp(back.back),yp(-h)]],'r2',true);mark(xp(back.back),yp(-h),'r2');
 const apertureKey=l.type==='y'&&l.outline==='rectangle'?'height':'aperture';const dx=xp(min)-22,top=yp(aperture/2),bottom=yp(-aperture/2);stroke([[dx,top],[dx,bottom]],apertureKey);for(const y of [top,bottom]){stroke([[dx-4,y],[dx+4,y]],apertureKey);stroke([[dx,y],[xp(min),y]],apertureKey,true);}
 c.textAlign='left';c.fillStyle=dimColors.aperture;c.fillText(l.outline==='circle'?'直径 D':l.type==='y'?'高度 Y':'宽度 X',12,130);c.fillText(formatMm(aperture)+' mm',12,148);stroke([[15,155],[dx,155]],apertureKey,true);
 const center=surfaceAt(l,0,0),x1=xp(center.front),x2=xp(center.back),ctY=232;stroke([[x1,yp(0)],[x2,yp(0)]],'thickness');mark(x1,yp(0),'thickness');mark(x2,yp(0),'thickness');stroke([[x1,yp(0)],[x1,ctY]],'thickness',true);stroke([[x2,yp(0)],[x2,ctY]],'thickness',true);stroke([[x1,ctY],[x2,ctY]],'thickness');for(const x of [x1,x2])stroke([[x,ctY-4],[x,ctY+4]],'thickness');c.textAlign='center';c.fillStyle=dimColors.thickness;c.fillText(d.labels.thickness,W/2,251);
 c.textAlign='left';c.fillStyle='#94a79b';c.fillText('入射 → Z',12,H-5);c.textAlign='right';c.fillText('长宽同尺度',W-12,H-5);c.textAlign='left';
}
function build(){if(!renderer)return;dispose(opticalGroup);dispose(beamGroup);pickables=[];const L=state.end,s=scales(),end=sizeAt(state,L),span=Math.max(120,end.width*s.w*1.2),floor=-Math.max(34,end.thickness*s.t*.75);
 const grid=new THREE.GridHelper(Math.max(L*1.3,span),20,0x334738,0x223328);grid.position.set(L/2,floor,0);opticalGroup.add(grid);
 opticalGroup.add(line([point(0),point(L)],0x627b64,.6));
 const source=new THREE.Mesh(new THREE.CylinderGeometry(8,8,38,32),new THREE.MeshStandardMaterial({color:0x34473d,metalness:.65,roughness:.4}));source.rotation.z=Math.PI/2;source.position.set(-24,0,0);opticalGroup.add(source);const aperture=new THREE.Mesh(new THREE.CircleGeometry(3,24),new THREE.MeshBasicMaterial({color:0xb6ff91,side:THREE.DoubleSide}));aperture.rotation.y=Math.PI/2;aperture.position.set(-4.8,0,0);opticalGroup.add(aperture);opticalGroup.add(label('532 nm',new THREE.Vector3(-20,30,0),undefined,.8));
 for(let i=0;i<=5;i++){const z=L*i/5;opticalGroup.add(line([new THREE.Vector3(z,floor,-span*.4),new THREE.Vector3(z,floor,span*.4)],0x334738,.7));opticalGroup.add(label(`${Math.round(z)} mm`,new THREE.Vector3(z,floor-8,span*.42),'#839889',.85));}
 state.lenses.forEach((l,index)=>{if(l.z>L||!l.enabled)return;const lensGroup=new THREE.Group();lensGroup.userData.lensIndex=index;
 const sc=s.w,issue=shapeIssue(l),width=l.aperture*sc,height=(l.outline==='rectangle'?l.height:l.aperture)*sc;
 const geometry=issue?new THREE.BoxGeometry(l.thickness*sc,height,width):lensGeometry(l,sc);
 const material=issue?new THREE.MeshBasicMaterial({color:0xe3b467,wireframe:true,transparent:true,opacity:.4}):new THREE.MeshPhysicalMaterial({color:l.type==='y'?0x9edcfa:l.type==='sphere'?0xe3cc99:0xace5b8,transparent:true,opacity:.34,roughness:.16,metalness:0,side:THREE.DoubleSide,depthWrite:false});
 const mesh=new THREE.Mesh(geometry,material);mesh.position.set(l.z,0,0);mesh.userData.index=index;lensGroup.add(mesh);pickables.push(mesh);
 if(!issue){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,35),new THREE.LineBasicMaterial({color:index===selected?0xd3efb8:0x729b80,transparent:true,opacity:.65}));edges.position.copy(mesh.position);lensGroup.add(edges);}
 lensGroup.add(line([new THREE.Vector3(l.z,-height/2,0),new THREE.Vector3(l.z,floor,0)],0x536556));
 lensGroup.add(label(`L${index+1} · ${issue?'无效外形':shapeNames[l.form]}`,new THREE.Vector3(l.z,height/2+12+(index%2)*11,0),undefined,.75));
 opticalGroup.add(lensGroup);
 });
 const zs=Array.from({length:241},(_,i)=>L*i/240);state.lenses.forEach(l=>{if(l.z>0&&l.z<L)zs.push(l.z);});zs.sort((a,b)=>a-b);const samples=zs.map(z=>({z,...sizeAt(state,z)}));
 for(const fraction of [1,.65,.3]){const pos=[],indices=[],N=36;samples.forEach(d=>{for(let j=0;j<N;j++){const angle=j/N*Math.PI*2;const p=point(d.z,d.width/2*fraction*Math.cos(angle),d.thickness/2*fraction*Math.sin(angle));pos.push(p.x,p.y,p.z);}});for(let i=0;i<samples.length-1;i++)for(let j=0;j<N;j++){const a=i*N+j,b=i*N+(j+1)%N,c=(i+1)*N+j,d=(i+1)*N+(j+1)%N;indices.push(a,b,c,b,d,c);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setIndex(indices);geometry.computeVertexNormals();beamGroup.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x8cff59,transparent:true,opacity:fraction===1?.09:.075,side:THREE.DoubleSide,depthWrite:false})));}
 if(state.rays){for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])beamGroup.add(line(samples.map(d=>point(d.z,d.width/2*Math.cos(angle),d.thickness/2*Math.sin(angle))),0xb2ff85,.65));}
 for(const [fraction,color] of [[1,0x8ddaf8],[Math.sqrt(Math.log(2)/2),0xf3ae91]]){const points=Array.from({length:97},(_,i)=>{const angle=i/96*Math.PI*2;return point(L,end.width/2*fraction*Math.cos(angle),end.thickness/2*fraction*Math.sin(angle));});const contour=line(points,color,.95);contour.userData.observationContour=true;beamGroup.add(contour);const fill=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false}));fill.scale.set(end.width*s.w/2*fraction,end.thickness*s.t/2*fraction,1);fill.rotation.y=Math.PI/2;fill.position.set(L+.01,0,0);fill.userData.observationContour=true;beamGroup.add(fill);}
 const width=end.width*s.w,thick=end.thickness*s.t,planeWidth=Math.max(width*1.2,30),planeHeight=Math.max(thick*1.5,35);const plane=new THREE.Mesh(new THREE.PlaneGeometry(planeWidth,planeHeight),new THREE.MeshBasicMaterial({color:0xc4dec5,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}));plane.rotation.y=Math.PI/2;plane.position.set(L,0,0);plane.userData.observation=true;opticalGroup.add(plane);const frame=line([new THREE.Vector3(L,-planeHeight/2,-planeWidth/2),new THREE.Vector3(L,planeHeight/2,-planeWidth/2),new THREE.Vector3(L,planeHeight/2,planeWidth/2),new THREE.Vector3(L,-planeHeight/2,planeWidth/2),new THREE.Vector3(L,-planeHeight/2,-planeWidth/2)],0x9ab09e,.45);frame.userData.observation=true;opticalGroup.add(frame);const planeLabel=label('观察面',new THREE.Vector3(L,planeHeight/2+15,0),'#c6d7c9',.85);planeLabel.userData.observation=true;opticalGroup.add(planeLabel);render();}
function drawCross(){
 const cv=$('#cross-section'),W=cv.clientWidth,H=510;if(!W)return;const dpr=Math.min(devicePixelRatio,2);cv.width=W*dpr;cv.height=H*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);
 const o=sizeAt(state,state.end),ratio=Math.sqrt(Math.log(2)/2),fwhm=o.thickness*ratio,blue='#8ddaf8',orange='#f3ae91',green='#b2f39b',muted='#94a79b';
 const text=(s,x,y,color=muted,align='left')=>{c.fillStyle=color;c.textAlign=align;c.font='12px system-ui';c.fillText(s,x,y);};
 const path=(pts,color,dash=false)=>{c.strokeStyle=color;c.lineWidth=1.2;c.setLineDash(dash?[3,4]:[]);c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.setLineDash([]);};
 const measure=(a,b,color)=>{path([a,b],color);const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,n=[-dy/len*4,dx/len*4];for(const p of [a,b])path([[p[0]-n[0],p[1]-n[1]],[p[0]+n[0],p[1]+n[1]]],color);};
 text(`观察面 Z = ${state.end} mm · 光斑宽厚按真实比例`,8,18);
 const scale=Math.min(Math.max(60,W-140)/o.width,110/o.thickness),rx=o.width/2*scale,ry=o.thickness/2*scale,cx=W/2,cy=120;
 for(let i=40;i>=1;i--){c.fillStyle=`rgba(174,255,118,${Math.exp(-2*(i/40)**2)*.055})`;c.beginPath();c.ellipse(cx,cy,Math.max(.05,rx*i/40),Math.max(.05,ry*i/40),0,0,Math.PI*2);c.fill();}
 for(const [r,col] of [[1,blue],[ratio,orange]]){c.strokeStyle=col;c.lineWidth=1;c.beginPath();c.ellipse(cx,cy,rx*r,ry*r,0,0,Math.PI*2);c.stroke();}
 const xl=cx-rx-18,xr=cx+rx+18;
 measure([xl,cy-ry*ratio],[xl,cy+ry*ratio],orange);measure([xr,cy-ry],[xr,cy+ry],blue);
 path([[cx-rx*ratio,cy-ry*ratio],[xl,cy-ry*ratio]],orange,true);path([[cx+rx,cy-ry],[xr,cy-ry]],blue,true);
 text('厚度 FWHM',8,44,orange);text(`${formatMm(fwhm)} mm`,8,62,orange);path([[25,68],[xl,cy]],orange,true);
 text('厚度 1/e²',W-8,44,blue,'right');text(`${formatMm(o.thickness)} mm`,W-8,62,blue,'right');path([[W-25,68],[xr,cy]],blue,true);
 measure([cx-rx,204],[cx+rx,204],green);path([[cx-rx,cy],[cx-rx,204]],green,true);path([[cx+rx,cy],[cx+rx,204]],green,true);
 text(`片宽 X（1/e²）= ${formatMm(o.width)} mm`,cx,229,green,'center');
 text('Y 方向的光强剖面 · 厚度位置单独放大',8,268);
 const left=54,right=W-16,top=291,bottom=449,x=y=>left+(y/o.thickness+.8)/1.6*(right-left),y=I=>bottom-I*(bottom-top);
 path([[left,top],[left,bottom],[right,bottom]],'#536958');
 for(const [I,col,label] of [[1,muted,'100%'],[.5,orange,'50%'],[Math.exp(-2),blue,'13.5%']]){path([[left,y(I)],[right,y(I)]],col,true);text(label,left-6,y(I)+4,col,'right');}
 const points=Array.from({length:241},(_,i)=>{const t=(-.8+i/240*1.6)*o.thickness;return [x(t),y(Math.exp(-2*(t/(o.thickness/2))**2))];});path(points,green);
 for(const [diam,I,col] of [[o.thickness,Math.exp(-2),blue],[fwhm,.5,orange]]){measure([x(-diam/2),y(I)],[x(diam/2),y(I)],col);for(const sign of [-1,1]){c.fillStyle=col;c.beginPath();c.arc(x(sign*diam/2),y(I),3,0,2*Math.PI);c.fill();}}
 text(`FWHM ${formatMm(fwhm)} mm`,x(0),y(.5)-9,orange,'center');text(`1/e² 厚度 ${formatMm(o.thickness)} mm`,x(0),y(Math.exp(-2))-9,blue,'center');
 for(const t of [-o.thickness/2,0,o.thickness/2])text(formatMm(t),x(t),471,muted,'center');text('Y 位置 / mm（中心为 0）',(left+right)/2,493,muted,'center');
 $('#beam-measure-values').textContent=`片宽 ${formatMm(o.width)} mm　·　1/e² 厚度 ${formatMm(o.thickness)} mm　·　FWHM ${formatMm(fwhm)} mm`;
}
function update({reframe=false}={}){const out=sizeAt(state,state.end);$('#thickness').innerHTML=`${out.thickness.toFixed(3)} <small>mm</small>`;$('#width').innerHTML=`${out.width.toFixed(2)} <small>mm</small>`;$('#fwhm').innerHTML=`${(out.thickness*Math.sqrt(Math.log(2)/2)).toFixed(3)} <small>mm</small>`;$('#lens-count').textContent=`${state.lenses.filter(l=>l.enabled).length} 片启用`;$('#scale-label').textContent=state.enhance?'片宽 ×3 · 厚度 ×30':'全部按真实比例';const warnings=[];
 if(out.thickness<.5-1e-6||out.thickness>2+1e-6)warnings.push('观察面厚度超出 0.5–2 mm');
 state.lenses.forEach((l,i)=>{if(!l.enabled)return;if(l.z>=state.end){warnings.push(`L${i+1} 位于观察面之后`);return;}const issue=shapeIssue(l);if(issue)warnings.push(`L${i+1} ${issue}，橙色线框仅示位置`);const o=sizeAt(state,l.z);if((l.outline==='rectangle'?(o.width>l.aperture*.8||o.thickness>l.height*.8):Math.max(o.width,o.thickness)>l.aperture*.8))warnings.push(`L${i+1} 口径可能截光，结果未计截光效应`);const powered=l.type==='x'?o.width:l.type==='y'?o.thickness:Math.max(o.width,o.thickness);if(powered/2/Math.abs(l.f)>.2)warnings.push(`L${i+1} 超出较小近轴角度`);});
 $('#status').textContent=warnings.length?warnings.join('；')+'。':`观察面 Z = ${state.end} mm，宽厚比 ${(out.width/out.thickness).toFixed(1)}:1。当前厚度处于目标调节范围内。`;build();drawCross();drawProfile();if(reframe)view();save();}
function renderLenses(){
 const list=$('#lens-list');list.replaceChildren();
 state.lenses.forEach((l,index)=>{
 const el=document.createElement('div');el.className='lens'+(selected===index?' selected':'');
 const r=radii(l)||{r1:0,r2:0},curved=l.mode==='curvature';
 el.innerHTML=`<div class="lens-head"><label><input type="checkbox" data-key="enabled">L${index+1}</label><button type="button" class="focus-lens" aria-label="查看透镜 L${index+1} 特写">特写 ↗</button><button type="button" class="remove-lens" aria-label="删除透镜 L${index+1}">移除 ×</button></div>
 <label>透镜类型<select data-key="type"><option value="x">柱面镜 · X 方向展宽</option><option value="y">柱面镜 · Y 方向控厚</option><option value="sphere">球面镜 · 两轴同时作用</option></select></label>
 <div class="field-grid"><label>位置 Z / mm<input type="number" min="0" max="3000" step="any" data-key="z"></label><label>${curved?'等效焦距 f':'焦距 f'} / mm<input type="number" min="-1000000000000" max="1000000000000" step="any" data-key="f" ${curved?'disabled':''}></label></div>
 <details class="shape-controls" ${index===selected?'open':''}><summary>外形与曲面 · ${shapeNames[l.form]}</summary>
 <label>控制方式<select data-key="mode"><option value="focal">按焦距选形状</option><option value="curvature">按曲率计算焦距</option></select></label>
 <label>曲面形状<select data-key="form"><option value="planoConvex">平凸</option><option value="biconvex">双凸</option><option value="planoConcave">平凹</option><option value="biconcave">双凹</option><option value="meniscus">弯月</option>${curved?'<option value="custom">自定义 R1 / R2</option>':''}</select></label>
 <label>口径外形<select data-key="outline"><option value="circle">圆形</option><option value="rectangle">矩形</option></select></label>
 <div class="field-grid"><label>${l.outline==='circle'?'直径 D':'宽度 X'} / mm<input type="number" min="1" max="150" step="any" data-key="aperture"></label><label>高度 Y / mm<input type="number" min="1" max="150" step="any" data-key="height" ${l.outline==='circle'?'disabled':''}></label></div>
 <div class="field-grid"><label>中心厚度 / mm<input type="number" min="0.1" max="100" step="any" data-key="thickness"></label><label>折射率 n @532nm<input type="number" min="1.1" max="2.5" step="any" data-key="n"></label></div>
 <div class="field-grid"><label>前表面 R1 / mm<input type="number" min="-10000000" max="10000000" step="any" data-key="r1" ${curved?'':'disabled'}></label><label>后表面 R2 / mm<input type="number" min="-10000000" max="10000000" step="any" data-key="r2" ${curved?'':'disabled'}></label></div>
 <p class="hint">R＝0 表示平面。R 正值：曲率中心在传播方向前方。光路按等效薄透镜计算。</p></details>`;
 el.querySelectorAll('[data-key]').forEach(input=>{
  input.onfocus=()=>{const changed=selected!==index;selected=index;activeDimension=input.dataset.key;document.querySelectorAll('#lens-list .lens').forEach((row,i)=>row.classList.toggle('selected',i===selected));if(changed){build();if(currentView==='lens')view();}else render();drawProfile();};
  const k=input.dataset.key,val=(k==='r1'||k==='r2')?r[k]:l[k];
  if(k==='enabled')input.checked=val;else input.value=typeof val==='number'?Number(val.toFixed(4)):val;
  input.onchange=()=>{
   const before={...l},isString=['type','mode','form','outline'].includes(k),value=k==='enabled'?input.checked:isString?input.value:Number(input.value);
   if(!isString&&k!=='enabled'&&(!input.value||!input.checkValidity()||!Number.isFinite(value)||(k==='f'&&Math.abs(value)<1)||(['r1','r2'].includes(k)&&value!==0&&Math.abs(value)<.1))){notify('请输入有效参数；R＝0 为平面，非零半径绝对值至少为 0.1 mm。');input.value=val;return;}
   if(k==='mode'&&value==='curvature'){const old=radii(l);if(old)Object.assign(l,old);}
   l[k]=value;
   if(k==='mode'&&value==='focal'&&l.form==='custom')l.form=l.f<0?'biconcave':'biconvex';
   if(k==='form'&&l.mode==='curvature'&&value!=='custom')Object.assign(l,presetRadii(l,value));
   if(k==='form'&&l.mode==='focal'){if(value==='planoConvex'||value==='biconvex')l.f=Math.abs(l.f);if(value==='planoConcave'||value==='biconcave')l.f=-Math.abs(l.f);}
   if(k==='f'&&l.mode==='focal'){if(l.f<0&&['planoConvex','biconvex'].includes(l.form))l.form=l.form==='planoConvex'?'planoConcave':'biconcave';if(l.f>0&&['planoConcave','biconcave'].includes(l.form))l.form=l.form==='planoConcave'?'planoConvex':'biconvex';}
   if(['r1','r2'].includes(k))l.form='custom';
   if(l.outline==='circle')l.height=l.aperture;
   if(l.mode==='curvature'){const f=focalLength(l);if(Number.isNaN(f)||Math.abs(f)<1){Object.assign(l,before);notify('等效焦距过短或无解，请重新调整曲率、厚度或折射率。');renderLenses();return;}l.f=Number.isFinite(f)?Math.max(-1e12,Math.min(1e12,f)):1e12;}
   selected=index;notify('');renderLenses();update();if(currentView==='lens')view();
  };
 });
 el.querySelector('.focus-lens').onclick=()=>{selected=index;renderLenses();build();drawProfile();view('lens');};
 el.querySelector('.remove-lens').onclick=()=>{state.lenses.splice(index,1);selected=Math.max(0,Math.min(selected,state.lenses.length-1));renderLenses();update();};list.append(el);
 });$('#add').disabled=state.lenses.length>=12;
}
function sync(){for(const k of ['diameter','m2','end','target'])$('#'+k).value=state[k];for(const k of ['enhance','rays'])$('#'+k).checked=state[k];$('#target-output').textContent=state.target.toFixed(2)+' mm';renderLenses();}
for(const k of ['diameter','m2','end'])$('#'+k).onchange=e=>{const v=Number(e.target.value);if(!e.target.value||!e.target.checkValidity()||!Number.isFinite(v)){e.target.value=state[k];return;}state[k]=v;notify('');update({reframe:k==='end'});};
$('#target').oninput=e=>{state.target=Number(e.target.value);$('#target-output').textContent=state.target.toFixed(2)+' mm';save();};$('#design').onclick=()=>{try{state.lenses=design(state,state.target).map(normalizeLens);selected=0;notify('');renderLenses();update({reframe:true});}catch(e){notify(e.message);}};
for(const k of ['enhance','rays'])$('#'+k).onchange=e=>{state[k]=e.target.checked;update({reframe:k==='enhance'});};
$('#add').onclick=()=>{if(state.lenses.length>=12)return;state.lenses.push(normalizeLens({id:Date.now(),type:'y',z:Math.round(state.end*.5),f:200,aperture:25.4,enabled:true}));selected=state.lenses.length-1;renderLenses();update();};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));$('#reset-camera').onclick=()=>view('perspective');
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({format:'laser-sheet-3d-v1',wavelength_nm:532,power_W:.5,state},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='laser-sheet-532nm.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('#import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>50000)throw new Error('方案文件过大。');const obj=JSON.parse(await file.text());if(!valid(obj.state))throw new Error('方案格式或参数范围不正确。');state=obj.state;state.lenses=state.lenses.map(normalizeLens);selected=0;sync();update({reframe:true});notify('方案已导入。');}catch(err){notify(err.message);}e.target.value='';};
init();sync();update({reframe:true});resize();
