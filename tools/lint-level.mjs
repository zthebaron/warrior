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

// Chapter length, Q4: 5 segments +/- 1, chapters 2 and up. Chapter 0 is the gym (not a chapter).
// Chapter 1 is deliberately NOT fixed: it teaches the primitives, and its length is an output of
// the teach rate, which the vertical slice has not measured yet (Q4 amendment 3). Set the chapter-1
// rule from that measurement, not before it.
export const CHAPTER_SEGMENTS = { target: 5, min: 4, max: 6, fromChapter: 2 };

export function lintLevel(level, manifest){
  const err=[],warn=[];
  const E=(c,m)=>err.push(`[${c}] ${m}`), W=(c,m)=>warn.push(`[${c}] ${m}`);
  const d=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  const inB=(p,b)=>p[0]>=b.min[0]&&p[0]<=b.max[0]&&p[1]>=b.min[1]&&p[1]<=b.max[1]&&p[2]>=b.min[2]&&p[2]<=b.max[2];
  const P=w=>Array.isArray(w)?w:w.pos;

  const ids=new Map();
  for (const k of ['platforms','interactables','enemies','collectibles'])
    for (const e of level[k]??[]){ if(!e.id) continue;
      if(ids.has(e.id)) E('DUP_ID',`id "${e.id}" used in ${ids.get(e.id)} and ${k}`); else ids.set(e.id,k); }

  const known=new Set(manifest.assets.map(a=>a.name));
  for (const p of [...(level.geometry??[]),...(level.platforms??[])])
    if(!known.has(p.asset)) E('UNKNOWN_ASSET',`"${p.asset}" not in manifest`);

  for (const i of level.interactables??[])
    for (const a of [...(i.onStrike??[]),...(i.onEnter??[])])
      if(a.op!=='win'&&!ids.has(a.target)) E('DANGLING_TARGET',`"${i.id}" -> unknown "${a.target}"`);

  const b=level.bounds, cp=level.critical_path;
  if(!inB(level.spawn.pos,b)) E('OOB','spawn outside bounds');
  if(level.goal.pos&&!inB(level.goal.pos,b)) E('OOB','goal outside bounds');
  cp.forEach((w,i)=>{ if(!inB(P(w),b)) E('OOB',`critical_path[${i}] outside bounds`); });
  (level.checkpoints??[]).forEach((c,i)=>{ if(!inB(c.pos,b)) E('OOB',`checkpoint[${i}] outside bounds`); });

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

  for(const hz of level.hazards??[]){
    if(hz.type==='fall'||!hz.pos) continue;
    for(const w of cp){ const p=P(w), s=hz.size??[1,1,1];
      if(Math.abs(p[0]-hz.pos[0])<s[0]/2&&Math.abs(p[2]-hz.pos[2])<s[2]/2&&Math.abs(p[1]-hz.pos[1])<3)
        E('HAZARD_ON_PATH',`${hz.type} hazard on a critical_path waypoint`); }
  }
  if(!(level.hazards??[]).some(h=>h.type==='fall')) W('NO_FALL_PLANE','no fall plane — leaving the world never respawns');

  const segs=segmentsOf(level), CL=CHAPTER_SEGMENTS;
  if(level.chapter>=CL.fromChapter&&(segs<CL.min||segs>CL.max))
    E('CHAPTER_LENGTH',`chapter ${level.chapter} has ${segs} segments (checkpoints+1); chapters ${CL.fromChapter}+ must have ${CL.target} +/- 1 (${CL.min}-${CL.max})`);
  if(level.chapter===1)
    W('CHAPTER_LENGTH_PENDING',`chapter 1 has ${segs} segments; its length rule is unset until the vertical slice measures the teach rate (Q4 amendment 3)`);

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
