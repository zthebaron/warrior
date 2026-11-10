import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=process.cwd(),imp=p=>import(pathToFileURL(root+'/'+p));
const THREE=await imp('node_modules/three/build/three.module.js');
const {obstaclesOf}=await imp('tools/lint-level.mjs');const {visibleTopBand}=await imp('tools/visible-top.mjs');
const manifest=JSON.parse(fs.readFileSync('assets/dist/manifest.json'));
let seed=1711;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
let worst=0;const rows=[];
for(let test=0;test<64;test++){
 const yaw=rand()*Math.PI*2,u=[Math.cos(yaw),Math.sin(yaw)],eye=[0,3.6631189606246317,0],top=2.5,near=8.657395614066075,far=near+3.5;
 const level={geometry:Array.from({length:4},()=>{const along=1+rand()*14,lateral=(rand()-.5)*3;return {asset:'prim_box',pos:[along*u[0]-lateral*u[1],1+rand()*6,along*u[1]+lateral*u[0]],scale:[.1+rand()*3,.1+rand()*3,.1+rand()*3],rot:[rand()*60,rand()*180,rand()*60]};})};
 const boxes=level.geometry.map(g=>{const m=new THREE.Matrix4().compose(new THREE.Vector3(...g.pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...g.rot.map(x=>x*Math.PI/180),'XYZ')),new THREE.Vector3(1,1,1));return {inverse:m.invert(),box:new THREE.Box3(new THREE.Vector3(...g.scale.map(x=>-x/2)),new THREE.Vector3(...g.scale.map(x=>x/2)))};});
 const actual=visibleTopBand(obstaclesOf(level,manifest),eye,u,top,near,far,18,60,-1);
 const lo=Math.atan2(top-eye[1],near),hi=Math.atan2(top-eye[1],far),N=8192;let visible=0;
 for(let k=0;k<N;k++){const a=lo+(k+.5)*(hi-lo)/N,d=[u[0]*Math.cos(a),Math.sin(a),u[1]*Math.cos(a)],target=(top-eye[1])/d[1];let blocked=false;
  for(const b of boxes){const o=new THREE.Vector3(...eye).applyMatrix4(b.inverse),v=new THREE.Vector3(...d).transformDirection(b.inverse),p=new THREE.Vector3();if(new THREE.Ray(o,v).intersectBox(b.box,p)&&p.distanceTo(o)<target){blocked=true;break;}}
  if(!blocked)visible++;
 }
 const sampled=visible/N*(hi-lo)*180/Math.PI,error=Math.abs(actual-sampled),bound=2*boxes.length/N*(hi-lo)*180/Math.PI;
 rows.push({test,actual,sampled,error,bound});worst=Math.max(worst,error);if(error>bound+1e-9)throw Error(JSON.stringify(rows.at(-1)));
}
fs.writeFileSync('state/rb-fixes-validation/visibility-crosscheck.json',JSON.stringify({cases:rows.length,worstErrorDeg:worst,rows},null,2)+'\n');console.log('PASS',rows.length,'independent oblique/rotated/overlapping-occlusion cases; worst angular error',worst);
