// Independently reproduced RB-003/RB-004 counterexamples and their controls.
// Shared data only: lint-self and the real-rig harness assert independently.
export function readabilityFixtures(chapter, wallFixture, legacy) {
  const out=[];
  const chapterCase=(name,geometry,index,reads)=>{
    const level=structuredClone(chapter);
    if(geometry) level.geometry.push(geometry);
    out.push({name,level,index,reads});
  };
  chapterCase('baseline',null,9,true);
  chapterCase('front-beam',{asset:'prim_box',pos:[55,10.35,0],scale:[0.5,0.7,7]},9,false);
  chapterCase('rear-beam',{asset:'prim_box',pos:[49.5,10.6,0],scale:[1,0.4,7]},9,false);
  chapterCase('render-only-rear-beam',{asset:'prim_box',pos:[49.5,10.6,0],scale:[1,0.4,7],collider:'none'},9,false);
  chapterCase('render-only-lifted-beam',{asset:'prim_box',pos:[49.5,13.6,0],scale:[1,0.4,7],collider:'none'},9,true);
  chapterCase('lifted-beam',{asset:'prim_box',pos:[55,13.35,0],scale:[0.5,0.7,7]},9,true);
  chapterCase('rotated-clear',{asset:'prim_box',pos:[4,4,1],scale:[0.3,8,4],rot:[0,45,0]},2,true);
  chapterCase('rotated-blocked',{asset:'prim_box',pos:[5.5,4,0],scale:[0.3,8,4],rot:[0,45,0]},2,false);
  chapterCase('envelope-blocked',{asset:'prim_box',pos:[4,4,1],scale:[3.04,8,3.04]},2,false);
  const shelf=(name,top,waypoint,depth,reads)=>{
    const level=structuredClone(wallFixture);
    level.id=`readability-${name}`;
    level.geometry=[level.geometry[0],{asset:'prim_box',pos:[10+depth/2,top/2,0],scale:[depth,top,7]}];
    level.critical_path=[[-20,0,0],{pos:[8,0,0],via:'ground'},{pos:[10.5,waypoint,0],via:top>3?'climb':'double'}];
    level.goal.pos=[10.5,top,0];
    out.push({name,level,index:2,reads});
  };
  shelf('honest-low',2.2,2.2,2.5,true);
  shelf('sunk-waypoint',2.5,2.2,2.5,false);
  shelf('honest-high',2.5,2.5,2.5,false);
  shelf('floating-waypoint',2.2,2.5,2.5,true);
  shelf('depth-edge',4.5,4.5,2.55,false);
  shelf('depth-interior',4.5,4.5,2.56,true);
  if(legacy) {
    out.push({name:'legacy-first-occluded',level:structuredClone(legacy),index:9,reads:false});
    out.push({name:'legacy-second-clear',level:structuredClone(legacy),index:16,reads:true});
  }
  return out;
}
