// tools/lint-level.mjs — semantic level linter (Proofline Game Track)
// Catches what JSON Schema cannot. Verified 2026-11-07: 14/14 defect classes caught.
// Usage: node tools/lint-level.mjs levels/<id>.json assets/dist/manifest.json
// Exit 0 = clean, 1 = errors. Warnings never fail the build.
// Linter v2 — critical_path waypoints are now MOVE-ANNOTATED.
// Fix for the v1 defect: v1 assumed every segment was a jump and rejected normal running.

const MOVE = {
  ground:   { maxH: Infinity, slope: 50, autostep: 0.5, maxDrop: 14.0, measured: true },
  jump:     { maxH:  5.0, maxRise: 2.0, maxDrop: 14.0, measured: true },
  double:   { maxH:  9.5, maxRise: 3.5, maxDrop: 14.0, measured: true },
  dash:     { maxH:  4.0, maxRise: 0.5, maxDrop: 14.0, measured: true },
  dashjump: { maxH: 10.0, maxRise: 2.75, maxDrop: 14.0, measured: true },
  wall:     { maxH:  4.2, maxRise: 4.0, maxDrop:  2.0, measured: true },
  climb:    { maxH:  7.0, maxRise: 4.5, maxDrop:  0.5, measured: true },
  platform: { maxH: Infinity, maxRise: Infinity, maxDrop: Infinity, measured: true }
};

// A SEGMENT is the run between two consecutive torii: spawn -> checkpoint[0] -> ... ->
// checkpoint[n-1] -> goal. So segments = checkpoints.length + 1. This is the ONE definition:
// CHAPTER_LENGTH below and the nav bot's time budget (tools/harness/nav.ts, via run.mjs) both
// use segmentsOf(). Two counts would be two rules. (PHASE-0-DECISIONS Q3, Q4.)
export const segmentsOf = (level) => (level.checkpoints?.length ?? 0) + 1;

// Chapter length is DERIVED, not ranged (D-011, overriding OQ-037; Q4 amendment 3 measured by chapter 1):
//   one TEACHING segment per new lethal move or new signal, introducing exactly one of them;
//   plus one TRANSFER segment: the chapter's riskiest new thing again, combined with another lethal move;
//   plus any PRACTICE segments: introduce no new move and no new signal, combine only what is taught.
// The 4-6 range survives only as a WARN sanity check (a derivation far outside it usually means the
// moveset changed). Chapter 0 is the gym (not a chapter); chapters past 4 add nothing to teach.
export const CHAPTER_SEGMENTS = { min: 4, max: 6, fromChapter: 1 };
// "Can kill you": a move that leaves the support surface. Ground never does; walking off an edge is a
// risk every segment carries, so it teaches nothing that needs its own segment (chapter 1, OQ-042).
export const NON_LETHAL_MOVES = ['ground'];
// Signals added per chapter (Q2, Q5): the crow cue is chapter 1's. A cued waypoint (`cue`) uses it.
export const CHAPTER_SIGNALS_ADDED = { 1: ['crow'] };
// The riskiest new thing per chapter, which gets the transfer segment. Chapter 1: the crow (Q5 calls it the
// riskiest unproven element). 2-4: the move Q5's table lists last, the one its notes single out (OQ-043).
export const CHAPTER_RISKIEST = { 1: 'crow', 2: 'double', 3: 'dash', 4: 'dashjump' };

// Respawn-point safety (Q6, B-8, D-005). These MIRROR the game: GAME_RULES.checkpointRadius,
// goalHeightTolerance, goalRadiusDefault in src/main.ts, and TUNING.capsuleRadius / capsule height in
// src/entities/player.ts. The Node linter cannot import browser TS, so the phase-sweep harness stage
// asserts they equal the running game's values: a drifted copy fails CI.
export const RESPAWN_RULES = { checkpointRadius: 2.0, heightTolerance: 2.0, goalRadiusDefault: 1.0, bodyRadius: 0.35, bodyHeight: 1.9 };

// HAZARD_AT_CHECKPOINT (D-005). For every place the player stands still (spawn, each checkpoint, the
// goal), against every hazard volume over its WHOLE motion. Static, phase-independent: a periodic
// hazard and an unbounded wait mean any overlap at any phase eventually happens.
//   swept volume  each patrol leg as an AABB grown by the box's half-extents (size is FULL extents,
//                 as the runtime and HAZARD_ON_PATH use it: OQ-017); a static hazard is its box.
//                 Conservative at corners by design: a false positive costs one edit.
//   player        a capsule: feet at the point, body 0..bodyHeight above it, radius bodyRadius.
//                 3D: a hazard passing overhead clear of the body is not a threat.
//   ERROR  the capsule standing exactly at the point intersects the volume: respawn into a hazard.
//   WARN   the volume only enters the activation disc (radius + bodyRadius), same body window:
//          a player waiting off-centre can be clipped. A skill matter, like FALL_DAMAGE.
function hazardBoxes(hz){
  if(!hz.size) return [];
  const e=hz.size.map(v=>v/2);
  if(hz.type==='patroller'){
    const P=hz.path??[], out=[];
    for(let k=1;k<P.length;k++) out.push({lo:[0,1,2].map(d=>Math.min(P[k-1][d],P[k][d])-e[d]), hi:[0,1,2].map(d=>Math.max(P[k-1][d],P[k][d])+e[d]), where:`patrol leg ${k-1}->${k}`});
    return out;
  }
  if(!hz.pos) return [];
  return [{lo:hz.pos.map((v,d)=>v-e[d]), hi:hz.pos.map((v,d)=>v+e[d]), where:'its volume'}];
}
// capsule-ish body (vertical cylinder) at feet p with horizontal reach r vs an AABB
const bodyHits=(b,p,r)=>b.hi[1]>p[1]&&b.lo[1]<p[1]+RESPAWN_RULES.bodyHeight&&
  Math.hypot(Math.max(0,b.lo[0]-p[0],p[0]-b.hi[0]),Math.max(0,b.lo[2]-p[2],p[2]-b.hi[2]))<r;

// Teaching order (Q5, B-4): moves ADDED per chapter, cumulative. Chapter 0 is the gym (every move);
// chapters past 4 have everything unlocked. Chapter agents cannot see each other, so the order lives
// in the data: a level declares `moves_allowed`, which must EQUAL its chapter's set (an agent cannot
// widen it), and every `via` must be in it. Source: PHASE-0-DECISIONS Q5's move-order table.
const ALL_MOVES=Object.keys(MOVE);
export const CHAPTER_MOVES_ADDED={1:['ground','jump','climb'],2:['wall','double'],3:['platform','dash'],4:['dashjump']};
export function chapterMoves(ch){
  if(ch===0||ch>4) return [...ALL_MOVES];
  const out=[]; for(let c=1;c<=ch;c++) out.push(...(CHAPTER_MOVES_ADDED[c]??[])); return out;
}

export function lintLevel(level, manifest){
  const err=[],warn=[];
  const E=(c,m)=>err.push(`[${c}] ${m}`), W=(c,m)=>warn.push(`[${c}] ${m}`);
  const d=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  const inB=(p,b)=>p[0]>=b.min[0]&&p[0]<=b.max[0]&&p[1]>=b.min[1]&&p[1]<=b.max[1]&&p[2]>=b.min[2]&&p[2]<=b.max[2];
  const P=w=>Array.isArray(w)?w:w.pos;

  const ids=new Map();
  for (const k of ['platforms'])
    for (const e of level[k]??[]){ if(!e.id) continue;
      if(ids.has(e.id)) E('DUP_ID',`id "${e.id}" used in ${ids.get(e.id)} and ${k}`); else ids.set(e.id,k); }

  const known=new Set(manifest.assets.map(a=>a.name));
  for (const p of [...(level.geometry??[]),...(level.platforms??[])])
    if(!known.has(p.asset)) E('UNKNOWN_ASSET',`"${p.asset}" not in manifest`);


  const b=level.bounds, cp=level.critical_path;
  if(!inB(level.spawn.pos,b)) E('OOB','spawn outside bounds');
  if(level.goal.pos&&!inB(level.goal.pos,b)) E('OOB','goal outside bounds');
  cp.forEach((w,i)=>{ if(!inB(P(w),b)) E('OOB',`critical_path[${i}] outside bounds`); });
  (level.checkpoints??[]).forEach((c,i)=>{ if(!inB(c.pos,b)) E('OOB',`checkpoint[${i}] outside bounds`); });

  // teaching order (Q5, B-4)
  if(typeof level.chapter==='number'){
    const want=chapterMoves(level.chapter), have=level.moves_allowed;
    if(!Array.isArray(have)) E('MOVES_ALLOWED',`chapter ${level.chapter} declares no "moves_allowed"; it must be [${want.join(', ')}] (Q5)`);
    else {
      const extra=have.filter(m=>!want.includes(m)), missing=want.filter(m=>!have.includes(m));
      if(extra.length||missing.length) E('MOVES_ALLOWED',`chapter ${level.chapter} moves_allowed must equal [${want.join(', ')}] (Q5)${extra.length?`; not yet unlocked: ${extra.join(', ')}`:''}${missing.length?`; missing: ${missing.join(', ')}`:''}`);
    }
    for(let i=1;i<cp.length;i++){ const v=typeof cp[i]==='object'&&cp[i].via;
      if(v&&MOVE[v]&&!want.includes(v)) E('CHAPTER_MOVE',`critical_path[${i}] via "${v}" is not unlocked in chapter ${level.chapter} (unlocked: ${want.join(', ')}). Teaching order is Q5's`); }
  }

  // move-aware reachability
  for(let i=1;i<cp.length;i++){
    const a=P(cp[i-1]), c=P(cp[i]);
    const via=(typeof cp[i]==='object'&&cp[i].via)||null;
    if(!via){ E('NO_VIA',`critical_path[${i}] has no "via" — agent must declare the move`); continue; }
    const m=MOVE[via];
    if(!m){ E('BAD_VIA',`critical_path[${i}] via "${via}" is not a known move`); continue; }
    if(m.measured===false){ E('UNMEASURED_MOVE',`critical_path[${i}] via "${via}": this move has never been measured in the gym. Its budget is a guess, so a level using it cannot be proven playable. Measure it, set measured:true, then use it.`); continue; }
    const h=d(a,c), rise=c[1]-a[1];
    // slope-based moves (ground) allow rise proportional to run; ballistic moves use a fixed ceiling
    const riseLimit = (m.slope!==undefined)
      ? Math.max(m.autostep, h*Math.tan(m.slope*Math.PI/180))
      : m.maxRise;
    if(h>m.maxH)      E('UNREACHABLE',`seg ${i-1}->${i} via ${via}: ${h.toFixed(1)}u > ${m.maxH}u`);
    if(rise>riseLimit)E('UNREACHABLE',`seg ${i-1}->${i} via ${via}: +${rise.toFixed(1)}u rise > ${riseLimit.toFixed(1)}u limit${m.slope?` (${m.slope}deg slope over ${h.toFixed(1)}u run)`:''}`);
    if(-rise>m.maxDrop)W('FALL_DAMAGE',`seg ${i-1}->${i}: ${(-rise).toFixed(1)}u drop`);
    if(via==='platform'){
      const pid=cp[i].platform;
      if(!pid||ids.get(pid)!=='platforms') E('BAD_PLATFORM_REF',`seg ${i-1}->${i} via platform needs a valid "platform" id`);
    }
    if(h>m.maxH*0.9&&h<=m.maxH) W('TIGHT',`seg ${i-1}->${i} via ${via} is at ${((h/m.maxH)*100).toFixed(0)}% of the limit`);
  }

  if(d(P(cp[0]),level.spawn.pos)>3) E('PATH_START','critical_path[0] not at spawn');
  const last=P(cp.at(-1));
  if(level.goal.pos&&d(last,level.goal.pos)>(level.goal.radius??3)) E('PATH_END','path does not end in goal radius');

  // NO_KILL_VOLUME (D-008): a hazard that can be authored with no effect is a schema defect, so each
  // type must carry the one form that kills. Mirrors the schema's per-type rules, because this linter
  // also runs standalone. (Patrollers report their own NO_* codes below.)
  const num=v=>typeof v==='number', v3=v=>Array.isArray(v)&&v.length===3;
  (level.hazards??[]).forEach((hz,i)=>{
    const vol=v3(hz.pos)&&v3(hz.size);
    if(hz.type==='fall'&&!num(hz.y)) E('NO_KILL_VOLUME',`hazards[${i}] fall has no "y": it is the kill plane, and without it nothing dies`);
    if(hz.type==='water'&&!num(hz.y)&&!vol) E('NO_KILL_VOLUME',`hazards[${i}] water needs a plane ("y", below it is death) or a volume ("pos" + "size"); with neither it never kills (D-008)`);
    if(hz.type==='water'&&num(hz.y)&&vol) E('NO_KILL_VOLUME',`hazards[${i}] water has both a plane "y" and a volume "pos"+"size"; pick one, the other would have no effect`);
    if((hz.type==='spike'||hz.type==='crush')&&!vol) E('NO_KILL_VOLUME',`hazards[${i}] ${hz.type} needs "pos" + "size" (full extents): its kill volume. There is no default (no unmeasured numbers)`);
  });
  // Crow cue (Q2, Q5). A waypoint's `cue` names the patroller whose crow says "go now" for that
  // segment, and the player WAITS for it at the previous waypoint. So: the cue must point at a
  // patroller that carries a crow (BAD_CUE), and the wait must happen at a torii or spawn, the only
  // places HAZARD_AT_CHECKPOINT proves safe to stand (CUE_NOT_AT_TORII; SPEC: "Arrive at a torii.
  // Wait for the crow. Go."). Chapter 1 must carry at least one cue (NO_CROW_CUE, Q5).
  const RR=RESPAWN_RULES, torii=[level.spawn.pos,...(level.checkpoints??[]).map(c=>c.pos)];
  const atTorii=p=>torii.some(t=>d(p,t)<RR.checkpointRadius&&Math.abs(p[1]-t[1])<RR.heightTolerance);
  let cues=0;
  cp.forEach((w,i)=>{
    if(typeof w!=='object'||Array.isArray(w)||w.cue===undefined) return;
    cues++;
    const hz=(level.hazards??[])[w.cue];
    if(!hz||hz.type!=='patroller'||!hz.crow){ E('BAD_CUE',`critical_path[${i}] cue ${w.cue}: hazards[${w.cue}] is not a patroller carrying a crow`); return; }
    if(i<1||!atTorii(P(cp[i-1]))) E('CUE_NOT_AT_TORII',`critical_path[${i}] cue ${w.cue}: the player waits for the crow at critical_path[${i-1}] ${JSON.stringify(P(cp[i-1]??cp[0]))}, which is not within ${RR.checkpointRadius}u of spawn or a checkpoint. Waiting is only proven safe at a torii (D-005)`);
  });
  if(level.chapter===1&&cues===0) E('NO_CROW_CUE','chapter 1 carries no crow cue: Q5 requires the vertical slice to prove the crow (a critical_path waypoint with "cue" -> a patroller with a "crow")');

  const falls=(level.hazards??[]).filter(h=>h.type==='fall').length;
  if(falls>1) E('NO_KILL_VOLUME',`${falls} fall planes: only the highest kill plane can ever take effect; keep one`);

  // Patrollers (Q2, B-1): speed and phase are mandatory, same severity as a missing via. A patroller
  // without them has no defined position at a given tick, so PHASE_SWEEP (B-7) has nothing to sweep.
  (level.hazards??[]).forEach((hz,i)=>{
    if(hz.type!=='patroller') return;
    if(typeof hz.speed!=='number') E('NO_SPEED',`hazards[${i}] patroller has no "speed" (u/s along its path)`);
    if(typeof hz.phase!=='number') E('NO_PHASE',`hazards[${i}] patroller has no "phase" (start offset, fraction of one loop)`);
    if(!Array.isArray(hz.path)||hz.path.length<2) E('NO_PATROL_PATH',`hazards[${i}] patroller needs a "path" of 2+ points`);
    if(!Array.isArray(hz.size)) E('NO_PATROL_SIZE',`hazards[${i}] patroller needs a "size": its kill volume. There is no default (no unmeasured numbers).`);
  });

  for(const hz of level.hazards??[]){
    if(hz.type==='fall'||!hz.pos) continue;
    for(const w of cp){ const p=P(w), s=hz.size??[1,1,1];
      if(Math.abs(p[0]-hz.pos[0])<s[0]/2&&Math.abs(p[2]-hz.pos[2])<s[2]/2&&Math.abs(p[1]-hz.pos[1])<3)
        E('HAZARD_ON_PATH',`${hz.type} hazard on a critical_path waypoint`); }
  }
  const R=RESPAWN_RULES;
  const stands=[{name:'spawn',pos:level.spawn.pos,radius:R.checkpointRadius},
    ...(level.checkpoints??[]).map((c,i)=>({name:`checkpoint[${i}]`,pos:c.pos,radius:R.checkpointRadius})),
    ...(level.goal?.pos?[{name:'goal',pos:level.goal.pos,radius:level.goal.radius??R.goalRadiusDefault}]:[])];
  for(const st of stands) (level.hazards??[]).forEach((hz,i)=>{
    const plane=hz.type==='fall'||(hz.type==='water'&&typeof hz.y==='number'&&!hz.pos);
    if(plane){
      if(typeof hz.y==='number'&&st.pos[1]<=hz.y) E('HAZARD_AT_CHECKPOINT',`${st.name} ${JSON.stringify(st.pos)} is at or below the ${hz.type} plane y=${hz.y}: arriving there is death`);
      return;
    }
    for(const b of hazardBoxes(hz)){
      if(bodyHits(b,st.pos,R.bodyRadius)){ E('HAZARD_AT_CHECKPOINT',`${st.name} ${JSON.stringify(st.pos)}: a player standing there intersects hazards[${i}] (${hz.type}) through ${b.where}. Respawn into a hazard (Q6, D-005)`); return; }
    }
    for(const b of hazardBoxes(hz)){
      if(bodyHits(b,st.pos,st.radius+R.bodyRadius)){ W('HAZARD_AT_CHECKPOINT',`${st.name} ${JSON.stringify(st.pos)}: hazards[${i}] (${hz.type}) enters its ${(st.radius+R.bodyRadius).toFixed(2)}u activation disc through ${b.where}; a player waiting off-centre can be clipped`); return; }
    }
  });
  if(!(level.hazards??[]).some(h=>h.type==='fall')) W('NO_FALL_PLANE','no fall plane — leaving the world never respawns');

  const segs=segmentsOf(level), CL=CHAPTER_SEGMENTS, ch=level.chapter;
  // D-011: place each segment on the path (a checkpoint ends its segment at the first waypoint after the
  // previous boundary within the activation radius), then classify each segment by what it introduces.
  if(typeof ch==='number'&&ch>=1&&ch<=4){
    const bounds=[]; let cur=0, placed=true;
    (level.checkpoints??[]).forEach((c,ci)=>{
      let k=-1; for(let j=cur+1;j<cp.length;j++){ const p=P(cp[j]); if(d(p,c.pos)<RR.checkpointRadius&&Math.abs(p[1]-c.pos[1])<RR.heightTolerance){k=j;break;} }
      if(k<0) for(let j=cur+1;j<cp.length&&k<0;j++){ // partway along a GROUND edge (as PHASE_SWEEP places it)
        const a=P(cp[j-1]), b2=P(cp[j]), ux=b2[0]-a[0], uz=b2[2]-a[2], L2=ux*ux+uz*uz; if(L2<1e-9) continue;
        const t=((c.pos[0]-a[0])*ux+(c.pos[2]-a[2])*uz)/L2, lat=Math.abs((c.pos[0]-a[0])*uz-(c.pos[2]-a[2])*ux)/Math.sqrt(L2), y=a[1]+(b2[1]-a[1])*t;
        if(t>=0&&t<=1&&lat<RR.checkpointRadius&&Math.abs(y-c.pos[1])<RR.heightTolerance&&(cp[j].via??'ground')==='ground') k=j-1; // the ground edge goes to the next segment
      }
      if(k<0){ E('SEGMENT_UNPLACED',`checkpoint[${ci}] ${JSON.stringify(c.pos)} is not at a critical_path waypoint after the previous torii, so its segment cannot be classified (D-011)`); placed=false; return; }
      bounds.push(k); cur=k;
    });
    if(placed){
      bounds.push(cp.length-1);
      const lethalNew=(CHAPTER_MOVES_ADDED[ch]??[]).filter(m=>!NON_LETHAL_MOVES.includes(m)), sigNew=CHAPTER_SIGNALS_ADDED[ch]??[];
      const items=[...lethalNew,...sigNew];
      const segUse=bounds.map((b,s)=>{ const lo=s?bounds[s-1]+1:1, u=new Set();
        for(let j=lo;j<=b;j++){ const w=cp[j]; if(typeof w!=='object'||Array.isArray(w)) continue;
          if(w.via&&!NON_LETHAL_MOVES.includes(w.via)) u.add(w.via); if(w.cue!==undefined) u.add('crow'); }
        return u; });
      const intro=Object.fromEntries(items.map(it=>[it,segUse.findIndex(u=>u.has(it))]));
      for(const it of items) if(intro[it]<0) E('CHAPTER_TEACH',`chapter ${ch} adds "${it}" but no segment uses it: a chapter teaches what it adds (D-011, Q5)`);
      const kinds=segUse.map((u,s)=>{ const here=items.filter(it=>intro[it]===s);
        if(here.length>1) E('CHAPTER_TEACH',`segment ${s} introduces ${here.length} new things at once (${here.join(', ')}): one new move or signal per teaching segment (D-011)`);
        return here.length?'teach':'other'; });
      const risk=CHAPTER_RISKIEST[ch];
      const transfer=items.includes(risk)&&intro[risk]>=0 ? segUse.findIndex((u,s)=>s>intro[risk]&&kinds[s]==='other'&&u.has(risk)&&[...u].some(x=>x!==risk&&x!=='crow')) : -1;
      if(items.length&&transfer<0) E('CHAPTER_TRANSFER',`chapter ${ch} has no transfer segment: after "${risk}" is introduced (segment ${intro[risk]}), a later segment that teaches nothing new must use it again together with another lethal move (D-011)`);
      if(transfer>=0) kinds[transfer]='transfer';
      const n=t=>kinds.filter(k=>k===t).length, derived=items.length+(items.length?1:0);
      if(segs<CL.min||segs>CL.max) W('CHAPTER_LENGTH',`chapter ${ch} has ${segs} segments (${n('teach')} teaching + ${n('transfer')} transfer + ${n('other')} practice; derived minimum ${derived}), outside the ${CL.min}-${CL.max} sanity range: check the moveset, not the rule (D-011)`);
    }
  }
  const span=d(level.spawn.pos,last), cps=(level.checkpoints??[]).length;
  if(span/Math.max(cps,1)>90) W('CHECKPOINT_GAP',`~${(span/Math.max(cps,1)).toFixed(0)}u between checkpoints`);
  const bytes=Buffer.byteLength(JSON.stringify(level));
  if(bytes>120*1024) E('SIZE',`${(bytes/1024).toFixed(0)}KB > 120KB`);
  return {ok:err.length===0,errors:err,warnings:warn};
}


// ---- CLI ----
import fs from 'fs';
if (process.argv[1] && process.argv[1].endsWith('lint-level.mjs')) {
  const [levelPath, manifestPath] = process.argv.slice(2);
  if (!levelPath || !manifestPath) {
    console.error('usage: node tools/lint-level.mjs <level.json> <manifest.json>'); process.exit(2);
  }
  const level = JSON.parse(fs.readFileSync(levelPath,'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const r = lintLevel(level, manifest);
  for (const w of r.warnings) console.warn('  warn ', w);
  for (const e of r.errors)   console.error('  ERROR', e);
  console.log(r.ok ? `LINT PASS  ${level.id}` : `LINT FAIL  ${level.id}  (${r.errors.length} errors)`);
  process.exit(r.ok ? 0 : 1);
}
