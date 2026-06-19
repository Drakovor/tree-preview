import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { createIcons, Eye, RefreshCw } from "lucide";

const canvas = document.querySelector("#scene");
const mobile = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 760;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const themes = {
  deep: { bg: 0x05020a, fog: 0x12071e, sun: 0x8b5dff, bloom: 0.28, exposure: 0.92 },
  rift: { bg: 0x07010d, fog: 0x25033d, sun: 0xbd70ff, bloom: 0.42, exposure: 1.02 },
  night: { bg: 0x020104, fog: 0x07030d, sun: 0x6d54a8, bloom: 0.2, exposure: 0.84 },
};
const colors = {
  deep: new THREE.Color(0x12071c), stone: new THREE.Color(0x17111e), hi: new THREE.Color(0x2a1c35),
  lane: new THREE.Color(0x281a31), cliff: new THREE.Color(0x09060d), rift: new THREE.Color(0x6710a4),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(themes.deep.bg);
scene.fog = new THREE.FogExp2(themes.deep.fog, 0.028);

const view = 54;
const camera = new THREE.OrthographicCamera(-view / 2, view / 2, view / 2, -view / 2, 0.1, 260);
camera.position.set(43, 38, 48);
camera.zoom = mobile ? 0.82 : 1;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minZoom = 0.78;
controls.maxZoom = 2.15;
controls.target.set(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssao = new SSAOPass(scene, camera, 1, 1, mobile ? 16 : 32);
ssao.kernelRadius = mobile ? 2.8 : 5.2;
ssao.minDistance = 0.004;
ssao.maxDistance = mobile ? 0.07 : 0.12;
composer.addPass(ssao);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), themes.deep.bloom, 0.48, 0.78);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uMood: { value: 0.72 } },
  vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uMood;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 col=c.rgb;float l=dot(col,vec3(.2126,.7152,.0722));float v=smoothstep(.02,.32,col.b+col.r*.7-col.g*1.05);float e=smoothstep(.08,.42,col.r-col.b*.65)*smoothstep(.02,.32,col.g-col.b*.2);float p=smoothstep(.08,.45,col.g-max(col.r,col.b)*.82);col=mix(col*vec3(.76,.68,.95),col,smoothstep(.14,.7,l));col+=vec3(.055,.006,.105)*v*uMood;col+=vec3(.12,.045,0.)*e*uMood*.42;col+=vec3(.025,.12,.035)*p*uMood*.28;float vig=smoothstep(.94,.22,distance(vUv,vec2(.5,.53)));col*=.76+vig*.28;gl_FragColor=vec4(pow(max(col,vec3(0.)),vec3(.95)),c.a);}`,
});
composer.addPass(grade);
const fxaa = new ShaderPass(FXAAShader);
composer.addPass(fxaa);
composer.addPass(new OutputPass());

const root = new THREE.Group();
const fxRoot = new THREE.Group();
scene.add(root);
root.add(fxRoot);
const hemi = new THREE.HemisphereLight(0x2c183f, 0x040206, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(themes.deep.sun, 3.2);
sun.position.set(-26, 46, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -62;
sun.shadow.camera.right = 62;
sun.shadow.camera.top = 62;
sun.shadow.camera.bottom = -62;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xff7a2f, 0.62);
rim.position.set(36, 18, -26);
scene.add(rim);

const laneMid = [[-43,-21],[-29,-15],[-15,-9],[-4,-3],[8,2],[21,10],[40,18]];
const laneUpper = [[-42,11],[-31,20],[-17,23],[-5,19],[8,21],[22,27],[41,28]];
const laneLower = [[-42,-27],[-30,-25],[-18,-17],[-9,-10],[3,-13],[17,-23],[40,-17]];
const riftPath = [[-44,1],[-31,4],[-18,0],[-6,-4],[7,-2],[22,3],[43,5]];
const ridges = [
  [[-36,4],[-27,11],[-17,13],[-7,10],[5,12],[17,17],[33,23]],
  [[-35,-10],[-24,-13],[-11,-16],[1,-16],[14,-12],[31,-7]],
  [[-38,25],[-24,31],[-6,32],[12,33],[34,35]],
  [[-38,-34],[-20,-37],[-2,-36],[18,-32],[38,-25]],
];
const routes = [laneMid, laneUpper, laneLower];
const animMats = [];
const animObjects = [];
const fogSheets = [];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function smooth(a,b,v){const t=clamp((v-a)/Math.max(.0001,b-a),0,1);return t*t*(3-2*t)}
function rand(seed){return()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function hash(x,z){const v=Math.sin(x*127.1+z*311.7)*43758.5453123;return v-Math.floor(v)}
function noise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,ux=fx*fx*(3-2*fx),uz=fz*fz*(3-2*fz);const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,ux),THREE.MathUtils.lerp(c,d,ux),uz)}
function nearest(px,pz,ax,az,bx,bz){const abx=bx-ax,abz=bz-az,apx=px-ax,apz=pz-az,l=abx*abx+abz*abz,t=l>0?clamp((apx*abx+apz*abz)/l,0,1):0,x=ax+abx*t,z=az+abz*t;return {x,z,t,dist:Math.hypot(px-x,pz-z),angle:Math.atan2(abz,abx)}}
function distPath(px,pz,pts){let best={dist:Infinity,x:0,z:0,t:0,angle:0,segment:0};for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],h=nearest(px,pz,a[0],a[1],b[0],b[1]);if(h.dist<best.dist)best={...h,segment:i}}return best}
function pathPoint(pts,t){const s=clamp(t,0,.9999)*(pts.length-1),i=Math.floor(s),u=s-i,a=pts[i],b=pts[i+1];return {x:THREE.MathUtils.lerp(a[0],b[0],u),z:THREE.MathUtils.lerp(a[1],b[1],u),angle:Math.atan2(b[1]-a[1],b[0]-a[0])}}
function info(x,z){
  const laneDist=Math.min(distPath(x,z,laneMid).dist,distPath(x,z,laneUpper).dist,distPath(x,z,laneLower).dist);
  const riftDist=distPath(x,z,riftPath).dist;
  const ridgeDist=Math.min(...ridges.map(r=>distPath(x,z,r).dist));
  const lane=1-smooth(1.9,4.4,laneDist), shoulder=1-smooth(4.5,8.6,laneDist), rift=1-smooth(2.1,5.3,riftDist), ridge=1-smooth(1.2,3.4,ridgeDist);
  const pA=1-smooth(5.8,9.6,Math.hypot(x-7.8,z-.8)),pB=1-smooth(4.8,8.2,Math.hypot(x+28,z-23)),pC=1-smooth(4.8,8.2,Math.hypot(x-28,z+23));
  const n=noise(x*.14+11,z*.14-4)*.58+noise(x*.46,z*.46+9)*.32;
  return { lane, shoulder, rift, ridge, pA, pB, pC, noise:n, height:n*.42-lane*.18-rift*.95+ridge*1.9+shoulder*.1+pA*.42+pB*.32+pC*.32 };
}
const h=(x,z)=>info(x,z).height;
function terrainColor(x,z,d){const c=colors.deep.clone().lerp(colors.hi,smooth(.05,.9,d.noise));c.lerp(colors.lane,d.lane*.76);c.lerp(colors.cliff,d.ridge*.65);c.lerp(new THREE.Color(0x220638),d.rift*.72);c.lerp(new THREE.Color(0x2a1637),Math.max(d.pA,d.pB,d.pC)*.46);return c}
function mat(o){return new THREE.MeshStandardMaterial({roughness:.9,metalness:0,...o})}
const mats={
  lane:mat({color:0x281a31,roughness:.95,emissive:0x08020f,emissiveIntensity:.04}), edge:mat({color:0x100915,roughness:.96}),
  cliff:mat({color:0x0b0710,roughness:.88,emissive:0x080010,emissiveIntensity:.05}), stone:mat({color:0x17101f,roughness:.86,emissive:0x12051f,emissiveIntensity:.05}),
  black:mat({color:0x09060d,roughness:.92}), ember:mat({color:0xff7a2f,emissive:0xff5c19,emissiveIntensity:2.2,roughness:.42}),
  pistachio:mat({color:0xb8ee8a,emissive:0x91ff66,emissiveIntensity:1.8,roughness:.38})
};
function terrain(){
  const g=new THREE.PlaneGeometry(96,72,mobile?128:192,mobile?96:144);g.rotateX(-Math.PI/2);const p=g.attributes.position,cols=[];
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),d=info(x,z);p.setY(i,d.height);const c=terrainColor(x,z,d);cols.push(c.r,c.g,c.b)}
  g.setAttribute("color",new THREE.Float32BufferAttribute(cols,3));g.computeVertexNormals();
  const m=mat({vertexColors:true,roughness:.94,emissive:0x0d0317,emissiveIntensity:.045});
  const mesh=new THREE.Mesh(g,m);mesh.name="True3D_Sculpted_Dark_Map_Terrain";mesh.receiveShadow=true;return mesh;
}
function ribbon(pts,width,material,yOff=.06,steps=140){
  const l=[],r=[];for(let i=0;i<=steps;i++){const p=pathPoint(pts,i/steps),n=pathPoint(pts,Math.min(1,(i+1)/steps)),a=Math.atan2(n.z-p.z,n.x-p.x),w=width*(.92+Math.sin(i*.21)*.08),nx=-Math.sin(a),nz=Math.cos(a),y=h(p.x,p.z)+yOff;l.push(new THREE.Vector3(p.x+nx*w,y,p.z+nz*w));r.push(new THREE.Vector3(p.x-nx*w,y,p.z-nz*w))}
  const v=[],uv=[];for(let i=0;i<steps;i++){const a=l[i],b=r[i],c=l[i+1],d=r[i+1];v.push(...a.toArray(),...b.toArray(),...c.toArray(),...b.toArray(),...d.toArray(),...c.toArray());uv.push(0,i/steps,1,i/steps,0,(i+1)/steps,1,i/steps,1,(i+1)/steps,0,(i+1)/steps)}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(v,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;return mesh;
}
function riftMat(){const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uFlow:{value:.35}},vertexShader:"varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:`uniform float uTime;uniform float uFlow;varying vec2 vUv;varying vec3 vW;void main(){float c=1.-smoothstep(.18,.52,abs(vUv.x-.5));float p=sin(vUv.y*34.-uTime*(1.4+uFlow*1.6)+sin(vW.x*.4)*.8)*.5+.5;float cut=smoothstep(.02,.2,vUv.x)*smoothstep(.02,.2,1.-vUv.x);vec3 col=mix(vec3(.075,0,.15),vec3(.36,.035,.68),c*.72);col=mix(col,vec3(.86,.32,1.),p*c*.36);gl_FragColor=vec4(col,cut*(.34+c*.38+p*c*.16));}`});animMats.push(m);return m}
function segmentBoxes(pts,material,thick=1.3,height=2.6){for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ang=Math.atan2(dz,dx),x=(a[0]+b[0])*.5,z=(a[1]+b[1])*.5;const mesh=new THREE.Mesh(new THREE.BoxGeometry(len*.96,height,thick),material);mesh.position.set(x,h(x,z)+height*.48,z);mesh.rotation.y=-ang;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)}}
function platform(x,z,rad,height,material,sides=32){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad*1.08,height,sides),material);mesh.position.set(x,h(x,z)+height*.5,z);mesh.castShadow=mesh.receiveShadow=true;return mesh}
function ring(x,z,rad,tube,material,y=.22){const mesh=new THREE.Mesh(new THREE.TorusGeometry(rad,tube,10,72),material);mesh.rotation.x=Math.PI/2;mesh.position.set(x,h(x,z)+y,z);mesh.castShadow=mesh.receiveShadow=true;return mesh}
function monolith(x,z,height,rad,material,rot=0){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rad*.72,rad,height,6),material);mesh.position.set(x,h(x,z)+height*.5,z);mesh.rotation.y=rot;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)}
function crystal(x,z,s=1){const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.82*s,1),mats.pistachio);mesh.position.set(x,h(x,z)+1.1*s,z);mesh.scale.set(.7,1.75,.7);mesh.castShadow=true;fxRoot.add(mesh);const light=new THREE.PointLight(0xb8ee8a,.7*s,9*s,2.2);light.position.copy(mesh.position).add(new THREE.Vector3(0,1.5*s,0));fxRoot.add(light);animObjects.push({object:mesh,spin:.2+s*.07,baseY:mesh.position.y,bob:.12*s})}
function ember(x,z,s=1){const base=new THREE.Mesh(new THREE.CylinderGeometry(.52*s,.64*s,.35*s,10),mats.black);base.position.set(x,h(x,z)+.18*s,z);base.castShadow=true;root.add(base);const flame=new THREE.Mesh(new THREE.SphereGeometry(.22*s,12,8),mats.ember);flame.position.set(x,base.position.y+.42*s,z);fxRoot.add(flame);const light=new THREE.PointLight(0xff6a25,.45*s,7*s,2.1);light.position.copy(flame.position);fxRoot.add(light);animObjects.push({object:flame,pulse:true,baseY:flame.position.y,light})}
function arch(x,z,ang,s=1){const g=new THREE.Group();g.position.set(x,h(x,z),z);g.rotation.y=ang;const col=new THREE.CylinderGeometry(.42*s,.62*s,3.4*s,8),top=new THREE.TorusGeometry(2.2*s,.34*s,8,36,Math.PI);[[-2.2,1.65,0],[2.2,1.65,0]].forEach(p=>{const m=new THREE.Mesh(col,mats.stone);m.position.set(p[0]*s,p[1]*s,p[2]);m.castShadow=m.receiveShadow=true;g.add(m)});const t=new THREE.Mesh(top,mats.stone);t.position.set(0,3.25*s,0);t.rotation.z=Math.PI;t.castShadow=t.receiveShadow=true;g.add(t);root.add(g)}
function maskRelief(){const g=new THREE.Group();g.position.set(9.5,h(9.5,4.8)+1.1,4.8);g.rotation.y=-.55;const brow=new THREE.BoxGeometry(5.8,.42,.72),horn=new THREE.ConeGeometry(.38,2.8,5),eye=new THREE.BoxGeometry(1.25,.13,.16);[[brow,-1,2,0,-.25],[brow,1,1.38,0,.25],[horn,-2.8,2.6,0,.45],[horn,2.8,2.6,0,-.45],[eye,-1.2,1.42,-.48,-.12,mats.pistachio],[eye,1.2,1.42,-.48,.12,mats.pistachio]].forEach(a=>{const m=new THREE.Mesh(a[0],a[5]||mats.stone);m.position.set(a[1],a[2],a[3]);m.rotation.z=a[4];m.castShadow=m.receiveShadow=true;g.add(m)});fxRoot.add(g)}
function scatter(){const r=rand(991377),geo=new THREE.DodecahedronGeometry(.8,0),mesh=new THREE.InstancedMesh(geo,mats.edge,mobile?120:210),d=new THREE.Object3D();let c=0;while(c<mesh.count){const x=-44+r()*88,z=-33+r()*66,o=info(x,z);if(!(o.ridge>.22||(o.shoulder>.35&&o.lane<.25&&r()>.46))||o.rift>.42)continue;const s=.22+r()*(o.ridge>.35?.9:.44);d.position.set(x,h(x,z)+s*.35,z);d.rotation.set(r()*Math.PI,r()*Math.PI,r()*Math.PI);d.scale.set(s*(.8+r()*.8),s*(.5+r()*.9),s*(.8+r()*.8));d.updateMatrix();mesh.setMatrixAt(c++,d.matrix)}mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh)}
function fog(){const specs=[[-18,2.8,-4,42,10,.12,.012],[18,4.2,9,36,8,.1,-.01],[2,7.5,24,62,13,.08,.007],[-4,2.2,-27,54,11,.09,-.008]];specs.forEach(([x,y,z,w,hg,op,dr])=>{const m=new THREE.MeshBasicMaterial({color:0x6c3b91,transparent:true,opacity:op*.35,depthWrite:false,side:THREE.DoubleSide}),p=new THREE.Mesh(new THREE.PlaneGeometry(w,hg),m);p.position.set(x,y,z);p.rotation.x=-Math.PI/2;p.userData={x,op,dr};fogSheets.push(p);root.add(p)})}
function build(){
  const base=new THREE.Mesh(new THREE.CylinderGeometry(62,68,2.2,8),mat({color:0x030106,roughness:.98,emissive:0x090011,emissiveIntensity:.12}));base.position.y=-2.4;base.rotation.y=Math.PI/8;root.add(base);
  root.add(terrain());routes.forEach(r=>{root.add(ribbon(r,2.84,mats.edge,.045));root.add(ribbon(r,2.45,mats.lane,.09))});fxRoot.add(ribbon(riftPath,2.75,riftMat(),.13,170));
  ridges.forEach((r,i)=>segmentBoxes(r,i>1?mats.black:mats.cliff,i>1?1.4:1.15,i>1?3.7:2.65));
  root.add(platform(7.8,.8,5.4,.82,mats.stone,42));fxRoot.add(ring(7.8,.8,4.4,.12,mats.pistachio,1.03));fxRoot.add(ring(7.8,.8,2.4,.08,mats.ember,1.1));
  root.add(platform(-28,23,3.4,.7,mats.black,24));root.add(platform(28,-23,3.4,.7,mats.black,24));
  [[2.5,8.5,5.6,.72,0.3],[12.4,-4.6,4.8,.62,.8],[-23,18.5,4.4,.55,1.8],[24,-18.2,4.7,.55,.4],[-10,-19.2,3.7,.46,2.4]].forEach(p=>monolith(p[0],p[1],p[2],p[3],mats.black,p[4]));
  arch(-19.2,8,.32,1.05);arch(19.6,-7.6,-2.62,1);arch(-4.8,-13.2,-.52,.82);crystal(7.8,.8,1.25);crystal(-28,23,.72);crystal(28,-23,.72);ember(-34,-19,.9);ember(35,16,.92);ember(-4,17,.7);maskRelief();scatter();fog();
}
function setTheme(name){const t=themes[name]||themes.deep;scene.background.set(t.bg);scene.fog.color.set(t.fog);sun.color.set(t.sun);renderer.toneMappingExposure=t.exposure;bloom.strength=t.bloom;document.querySelectorAll(".season").forEach(b=>b.classList.toggle("active",b.dataset.season===name))}
function setFog(v){scene.fog.density=.012+v*.045;fogSheets.forEach(p=>p.material.opacity=p.userData.op*(.45+v*1.45));animMats.forEach(m=>{if(m.uniforms.uFlow)m.uniforms.uFlow.value=v})}
function reset(){camera.position.set(43,38,48);camera.zoom=mobile?.82:1;controls.target.set(0,0,0);camera.updateProjectionMatrix();controls.update()}
function ui(){createIcons({ icons: { Eye, RefreshCw } });const b=document.querySelector("#toggleLeaves");document.querySelector("#randomize")?.addEventListener("click",reset);b?.addEventListener("click",()=>{fxRoot.visible=!fxRoot.visible;b.classList.toggle("active",fxRoot.visible)});document.querySelector("#wind")?.addEventListener("input",e=>setFog(Number(e.target.value)));document.querySelector("#density")?.addEventListener("input",e=>root.scale.y=THREE.MathUtils.lerp(.72,1.28,Number(e.target.value)));document.querySelectorAll(".season").forEach(x=>x.addEventListener("click",()=>setTheme(x.dataset.season)));setFog(Number(document.querySelector("#wind")?.value||.35))}
function resize(){const w=innerWidth,h=innerHeight,aspect=w/h;renderer.setSize(w,h,false);composer.setSize(w,h);camera.left=-view*aspect/2;camera.right=view*aspect/2;camera.top=view/2;camera.bottom=-view/2;camera.updateProjectionMatrix();fxaa.material.uniforms.resolution.value.set(1/(w*renderer.getPixelRatio()),1/(h*renderer.getPixelRatio()))}
const clock=new THREE.Clock();function animate(){const t=clock.getElapsedTime();controls.update();animMats.forEach(m=>m.uniforms.uTime&&(m.uniforms.uTime.value=t));animObjects.forEach(o=>{if(o.spin){o.object.rotation.y+=o.spin*.01;o.object.position.y=o.baseY+Math.sin(t*1.2+o.object.position.x)*o.bob}else{const p=.82+Math.sin(t*7+o.object.position.x)*.18;o.object.scale.setScalar(p);o.object.position.y=o.baseY+Math.sin(t*5)*.04;if(o.light)o.light.intensity=.32+p*.26}});fogSheets.forEach(p=>p.position.x=p.userData.x+Math.sin(t*.18+p.userData.x)*2.2*Math.sign(p.userData.dr||1));composer.render();requestAnimationFrame(animate)}

build();ui();setTheme("deep");resize();reset();addEventListener("resize",resize);animate();
window.__DRAKO_TRUE_3D_DEBUG__=()=>({true3D:true,renderer:"three.js",objects:scene.children.length,mapChildren:root.children.length,zoom:Number(camera.zoom.toFixed(3)),quality:mobile?"mobile":"desktop"});
