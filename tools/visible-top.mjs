// Exact angular occlusion in the camera's centre plane. No ray-count budget: intersect each
// obstacle triangle with that plane, clip it in front of the eye and above the target top,
// then subtract the union of its projected angles from the landing's angular interval.
const BOX_FACES = [[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],
  [2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];
const EPS = 1e-12; // numerical degeneracy only, not a readability allowance

function* triangles(b) {
  if (b.tris) {
    const { W, ix } = b.tris;
    for (let k=0;k<ix.length;k+=3) yield [0,1,2].map(j=>Array.from(W.slice(ix[k+j]*3,ix[k+j]*3+3)));
  } else {
    for (const face of BOX_FACES) yield face.map(i=>b.corners[i]);
  }
}

// Clip a convex polygon (a segment is allowed) to f(p)>=0.
function clip(poly, f) {
  const out=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i], b=poly[(i+1)%poly.length], fa=f(a), fb=f(b);
    if(fa>=0) out.push(a);
    if((fa<0)!==(fb<0)) { const t=fa/(fa-fb); out.push(a.map((v,k)=>v+t*(b[k]-v))); }
  }
  return out;
}

export function visibleTopBand(obstacles, eye, u, top, near, far, pitch, fov, landingIndex) {
  if(top>=eye[1] || far<=near) return 0;
  const deg=180/Math.PI, h=top-eye[1];
  const low=Math.max(-pitch-fov/2,Math.atan2(h,near)*deg);
  const high=Math.min(-pitch+fov/2,Math.atan2(h,far)*deg);
  if(high<=low) return 0;
  const intervals=[];
  for(const b of obstacles) {
    if(b.gi===landingIndex || b.mx[1]<=top) continue;
    for(const tri of triangles(b)) {
      const side=tri.map(p=>(p[0]-eye[0])*u[1]-(p[2]-eye[2])*u[0]);
      if(side.every(s=>s>EPS)||side.every(s=>s<-EPS)) continue;
      let points=[];
      for(let i=0;i<3;i++) {
        const j=(i+1)%3, a=tri[i], s=side[i], t=side[j];
        if(Math.abs(s)<=EPS) points.push(a);
        if((s<0&&t>0)||(s>0&&t<0)) points.push(a.map((v,k)=>v+s/(s-t)*(tri[j][k]-v)));
      }
      points=points.map(p=>[(p[0]-eye[0])*u[0]+(p[2]-eye[2])*u[1],p[1]]);
      points=clip(clip(points,p=>p[0]),p=>p[1]-top);
      if(!points.length || !points.some(p=>p[1]>top+EPS)) continue;
      const angles=points.map(p=>Math.atan2(p[1]-eye[1],p[0])*deg);
      const lo=Math.max(low,Math.min(...angles)), hi=Math.min(high,Math.max(...angles));
      if(hi>lo) intervals.push([lo,hi]);
    }
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  let end=low, hidden=0;
  for(const [lo,hi] of intervals) { if(hi>end) { hidden+=hi-Math.max(lo,end); end=hi; } }
  return Math.max(0,high-low-hidden);
}
