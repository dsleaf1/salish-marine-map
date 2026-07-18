/* physics.js — shared wind/wave/steepness/quartering model, extracted VERBATIM from
   force_explorer.html on 2026-07-16 (regression-proved numerically identical at extraction —
   see quarter_tests.mjs + the extraction identity check). ONE source of truth, consumed by:
     (a) force_explorer.html via <script src="physics.js"> (classic script — works over file://)
     (b) unified_map.html's steepness layer via steepCell() (ported 2026-07-17 — Model_Replay_Plan.md
         step 2; the map's previous inline copy of this model is deleted)
     (c) Node harnesses via fe_api.mjs (quarter_tests.mjs, force_sensitivity.mjs,
         gen_justif_data.mjs, and the step-3 nightly divergence scanner).
   NO DOM, no imports. Top-level let/const/function declarations of a classic script land in the
   global (lexical) scope, so the explorer's inline script still reads/assigns seaModel /
   blockModel / curToward directly, exactly as before the extraction.

   INPUTS.
   - Model modes (module state): seaModel "dir"|"ray"; blockModel "mono"|"spec";
     curToward deg (direction the current sets TOWARD).
   - Environment: setEnv({U,phi,V,L,W,B,hdg}) — U wind kt · phi wind-FROM deg · V current kt ·
     L channel length km · W channel width km · B boat waterline m · hdg paddler course deg.
     Same keys and units as the explorer's sliders; the explorer syncs ENV in state(), the Node
     harnesses via fe_api's api.set / api.cfg. compute() and encounter() read ENV — nothing here
     reads the DOM.
   ANCHOR-PERTURBATION NOTE: force_sensitivity.mjs's "anchors" stage string-patches THIS source
   (QW_ANCH rows, whitecap ramp, surf amplifier, qBand cutlines, consequence gate). Keep those
   expressions textually stable, or update its PATCHES table in the same commit. */
const ENV={U:15, phi:20, V:1.2, L:16, W:6, B:5, hdg:180};
function setEnv(o){ for(const k in o) if(k in ENV && o[k]!=null && isFinite(+o[k])) ENV[k]=+o[k]; }
/* EXPERIMENTAL PROTOTYPE toggles (David's 2026-07-17 decision): the whitecapping floor and the
   surf/broach (encounter) amplifier stay in the model as TOGGLES, defaults ON — the project
   pattern: the best current model is the default, toggles preserve the alternates for teaching
   and review. Their anchors (8→22 kt whitecap ramp, 0.35 surf amplitude, 1→3·L drive band) are
   expert judgment, UNCALIBRATED against observation; the model-replay expert review
   (Model_Replay_Plan.md) is the calibration instrument. OFF ⇒ exactly the pre-2026-07-15
   quartering model (floor inert, encounter ≡ 1). Steepness bands are unaffected either way. */
const PROTO={whitecap:true, surf:true};
// same shape (and same kt→m/s wind conversion) as the explorer's old slider-reading state()
function envState(){ return {U:ENV.U*KT, phi:ENV.phi, V:ENV.V, L:ENV.L, W:ENV.W, B:ENV.B, hdg:ENV.hdg}; }

const G=9.81, KT=0.514444, RHO=1025;
// --- physics (same core as the map) ---
function windSea(U,F){ if(U<0.5||F<500) return {Hs:0,Tp:0};
  const Hs_f=4.0*U*Math.sqrt(1.6e-7*F/G), X=G*F/(U*U), Tp_f=1/(3.5*(G/U)*Math.pow(X,-0.33));
  return {Hs:Math.min(Hs_f,0.24*U*U/G),Tp:Math.min(Tp_f,0.72*U)}; }
function haz(Hs,Tp,dirFrom,curKt,curToward){                 // returns band, S, hf, Hamp
  if(!(Hs>0.05)||!(Tp>0)) return {band:-1,S:0,hf:1,Hamp:0};
  const c0=G*Tp/(2*Math.PI), Uopp=Math.abs(curKt)*KT*Math.cos((curToward-dirFrom)*Math.PI/180);
  const L0=c0*Tp, S0=Hs/L0, alpha=-Uopp/c0, disc=1+4*alpha; let band,hf,S;
  if(alpha<0&&disc<=0){ band=4; hf=2.5; S=0.16; }
  else { const x=Math.abs(alpha)<1e-9?1:(-1+Math.sqrt(disc))/(2*alpha);
    hf=Math.min(Math.pow(x,1.5)/Math.sqrt(Math.max(2-x,1e-6)),2.5);
    S=Math.pow(x,3.5)/Math.sqrt(Math.max(2-x,1e-6))*S0;
    band=(!isFinite(S)||S>=0.143)?4:S>=0.10?3:S>=0.075?2:S>=0.05?1:0; }
  let Hamp=Hs*hf;
  if(Hamp<0.3) band=Math.min(band,1); else if(Hamp<0.5) band=Math.min(band,2);
  return {band,S:Math.min(S,0.2),hf,Hamp,Uopp,c0,L0}; }
/* SPECTRAL blocking with BREAKING SATURATION.
   A real wind sea is a spectrum: each frequency has its own phase speed and blocks at its own current
   (short/slow waves first), which turns the monochromatic blocking singularity into a gradual ramp
   (Chawla & Kirby 2002; SWAN). Crucially, blocked energy is NOT deleted: at every stage breaking caps
   each component's height at the 1/7-steepness limit for its LOCAL (shortened) wavelength. Since a
   component's steepness under current is S_c = af·x²·S0c, that cap is af ≤ (1/7)/(S0c·x²) — and at
   blocking (x=2) this equals (1/7)/(4·S0c), so the energy is CONTINUOUS across the blocking threshold.
   Without this, the model reports the transmitted remnant (waves that survived past the blocking
   barrier) and the absurdity follows that MORE current ⇒ LESS wave height ⇒ lower hazard: David's
   second anomaly (2.7→2.9 kt dropped Hamp 0.35→0.18 m). With saturation, height plateaus at the
   breaking-limited chop (≈(1/7)·L_blocked/4 per component) — the standing, breaking sea you actually
   find at a tide rip — and hazard is monotone in the current (verified 0 inversions over 100 sweeps).
   The consequence gate uses the RUNNING MAX of the (breaking-weighted) height over currents up to the
   present one: blocking is spatial, and a paddler at this spot encounters the peak of the transition
   zone, not just its asymptote. Fixed 0.05 m/s grid so larger currents evaluate a superset of points
   (monotone by construction). Breaking water also carries more consequence per metre of height, hence
   the (1+0.8·fBrk) weighting. */
/* PM spectral grid, hoisted 2026-07-17 (perf, for the map's 6,200-cell steepCell decode):
   SAME loop bounds/step/weight expression/skip as the previous inline computation, run once at
   init — values and summation order are bit-identical, only the per-call pow/exp cost is gone
   (624→232 ms in steep_bench.mjs; wSum unchanged per call since skipped entries never join). */
const SPEC_R=[], SPEC_W=[];
for(let r=0.6;r<=1.9;r+=0.05){                      // r = f/fp; component phase speed c = c0/r
  const w=Math.pow(r,-5)*Math.exp(-1.25*Math.pow(r,-4));   // Pierson–Moskowitz spectral shape
  if(w>1e-6){ SPEC_R.push(r); SPEC_W.push(w); } }
function specCore(Hs,Tp,Uopp){
  const c0=G*Tp/(2*Math.PI); let sSum=0,wSum=0,eSum=0,bSum=0;
  for(let i=0;i<SPEC_R.length;i++){
    const r=SPEC_R[i], w=SPEC_W[i], c=c0/r;
    wSum+=w;
    const S0c=Hs/(2*Math.PI*c*c/G);                 // component calm-water steepness (own wavelength)
    const alpha=-Uopp/c, disc=1+4*alpha;
    const x=(alpha<0&&disc<=0)?2:(Math.abs(alpha)<1e-9?1:(-1+Math.sqrt(disc))/(2*alpha));
    const inv=Math.pow(x,1.5)/Math.sqrt(Math.max(2-x,1e-6));   // inviscid wave-action amplification
    const cap=(1/7)/(S0c*x*x);                       // breaking-limited amplitude at local wavelength
    const af=Math.min(inv,cap);
    if(cap<=inv) bSum+=w;                            // this component is breaking-saturated
    sSum+=w*Math.min(af*x*x*S0c,1/7); eSum+=w*af*af;
  }
  const S=sSum/wSum, hf=Math.sqrt(eSum/wSum), fBrk=bSum/wSum, Hamp=Hs*hf;
  return {S,hf,fBrk,Hamp,gateH:Hamp*(1+0.8*fBrk)};
}
/* fast=true is a BAND-ONLY path for bulk callers (steepCell: the map decodes ~6,200 cells per
   timeline scrub; the full envelope fan measured 2.1 s — steep_bench 2026-07-17). It skips the
   consequence-gate envelope when the skip is PROVABLY band-preserving (the deleted map copy's
   own gate-skip argument, now at this module's grids): if band<2 the gate's caps to ≤1/≤2 can't
   change it, and if now.gateH≥0.5 the envelope max (≥ now.gateH) can't bite. Regression-proved
   band-identical to the full path in test/physics_regression.mjs. NB the fast return's gateH is
   now.gateH (not the envelope max) — band is unaffected, so fast is for band consumers only. */
function hazSpec(Hs,Tp,dirFrom,curKt,curToward,fast){
  const c0=G*Tp/(2*Math.PI);
  if(!(Hs>0.05)||!(Tp>0)) return {band:-1,S:0,hf:1,Hamp:0,Uopp:0,c0,L0:c0*Tp,fBrk:0,gateH:0};
  const Uopp=Math.max(0,Math.abs(curKt)*KT*Math.cos((curToward-dirFrom)*Math.PI/180));
  const now=specCore(Hs,Tp,Uopp);
  let band=now.S>=0.143?4:now.S>=0.10?3:now.S>=0.075?2:now.S>=0.05?1:0;
  if(fast&&(band<2||now.gateH>=0.5))
    return {band,S:Math.min(now.S,0.2),hf:now.hf,Hamp:now.Hamp,fBrk:now.fBrk,Uopp,c0,L0:c0*Tp,gateH:now.gateH};
  let gateH=0; const top=Math.ceil(Uopp/0.05)*0.05+1e-9;
  for(let u=0;u<=top;u+=0.05) gateH=Math.max(gateH, specCore(Hs,Tp,u).gateH);
  if(gateH<0.3) band=Math.min(band,1); else if(gateH<0.5) band=Math.min(band,2);
  return {band,S:Math.min(now.S,0.2),hf:now.hf,Hamp:now.Hamp,fBrk:now.fBrk,Uopp,c0,L0:c0*Tp,gateH}; }
let blockModel="mono";
function hazard(Hs,Tp,dirFrom,cur,curTo,model,fast){ return (model||blockModel)==="spec"?hazSpec(Hs,Tp,dirFrom,cur,curTo,fast):haz(Hs,Tp,dirFrom,cur,curTo); }
// idealized channel: paddler mid-channel; along-axis fetch up to length L, across up to half-width
function fetchKm(phiFromAxisDeg,Lkm,Wkm){ const d=Math.abs(((phiFromAxisDeg%180)+180)%180); // 0..180
  const dd=(d>90?180-d:d)*Math.PI/180, c=Math.max(Math.cos(dd),1e-3), s=Math.max(Math.sin(dd),1e-3);
  return Math.min(Lkm/c, (Wkm/2)/s); }
const BAND_WORD=["Very low","Low","Medium","High","Very high"];
// channel axis is vertical (0° = up = "down the channel toward the paddler at bottom-centre view")
let curToward=0;                                            // 0 = ebb toward you (N/up); 180 = flood away
// P (kW/m) from height & period
const powerKW=(H,Tp)=> RHO*G*G/(64*Math.PI)*H*H*Tp/1000;
const energyKJ=(H)=> RHO*G*H*H/16/1000;
/* Sea model. "Single ray" sends all wave energy exactly downwind with one ray's fetch — simple, but
   in a channel it makes an oblique wind read WORSE than a head-on one (anomaly 3): the head-on sea
   in fact CONTAINS the oblique chop (a wind sea's short-wave tail saturates at a level set by the
   wind, nearly independent of fetch — Phillips saturation, the JONSWAP tail), plus the big waves.
   "Directional components" is the restricted-fetch method (Seymour 1977; Donelan 1980 slanting
   fetch; field-confirmed in narrow bays by Pettersson, Kahma & Tuomi 2010): the wind raises a
   component sea in EVERY direction δ off the wind, driven by the wind component U·cosδ over that
   direction's own fetch. The DOMINANT system (largest period — Donelan's criterion) carries the
   sea's energy and is displayed; the HAZARD is the worst band over all components — a mixed sea is
   as dangerous as its worst subsystem, not its energy-weighted average. Max of monotone functions
   keeps hazard monotone in current; max over a rotating fan keeps it smooth in wind direction. */
let seaModel="dir";
function compute(phiDeg, model){                            // full result for a wind FROM phiDeg
  const s=envState(), span=(seaModel==="dir")?80:0;
  let dom=null, worst=null; const comps=[];                 // comps: every viable component, kept
  for(let d=-span; d<=span; d+=5){                          // for the directional (quartering) model
    const Ueff=s.U*Math.cos(d*Math.PI/180); if(span&&Ueff<0.3) continue;
    const from=((phiDeg+d)%360+360)%360;
    const F=fetchKm(from,s.L,s.W)*1000, w=windSea(Ueff,F);
    if(!dom||w.Tp>dom.Tp) dom={Hs:w.Hs,Tp:w.Tp,from,Fkm:F/1000};
    if(span&&!(w.Hs>0.05)) continue;
    const h=hazard(w.Hs,w.Tp,from,s.V,curToward,model);
    comps.push({from,d,Hs:w.Hs,Tp:w.Tp,Uw:s.U/KT,h});   // Uw: wind over the water (kt), for the whitecap floor
    if(!worst||h.band>worst.band||(h.band===worst.band&&h.S>worst.S))
      worst={...h,from,d,Fkm:F/1000,cHs:w.Hs,cTp:w.Tp};
  }
  if(!worst){                                               // calm / no viable component
    const F=fetchKm(phiDeg,s.L,s.W)*1000, w=windSea(s.U,F);
    const h=hazard(w.Hs,w.Tp,phiDeg,s.V,curToward,model);
    dom={Hs:w.Hs,Tp:w.Tp,from:phiDeg,Fkm:F/1000};
    worst={...h,from:phiDeg,d:0,Fkm:F/1000,cHs:w.Hs,cTp:w.Tp};
    comps.push({from:phiDeg,d:0,Hs:w.Hs,Tp:w.Tp,Uw:s.U/KT,h});
  }
  // dominant system's own transformation on the current (headline height/period/power)
  const hd=(dom.from===worst.from && dom.Tp===worst.cTp) ? worst
         : hazard(dom.Hs,dom.Tp,dom.from,s.V,curToward,model);
  const P=powerKW(hd.Hamp||0, dom.Tp), E=energyKJ(hd.Hamp||0);
  return {phiDeg, fetch:worst.Fkm, dom, gov:worst, comps,
          Hs:dom.Hs, Tp:dom.Tp, L0:hd.L0, hf:hd.hf, Hamp:hd.Hamp,
          band:worst.band, S:worst.S, Uopp:worst.Uopp, c0:worst.c0, P, E}; }
/* MAP / SCANNER ENTRY POINT (step-2 port, 2026-07-17). One steepness cell: the SAME directional
   fan as compute() (δ ±80° step 5°, Ueff<0.3 skip, Hs>0.05 skip, worst band over components,
   dominant = max-Tp system), but the fetch comes from a PROVIDER fetchAtKm(fromDeg)→km supplied
   by the caller. That is the fan-vs-16-sector unification: fetch GEOMETRY belongs to the consumer
   (unified_map ray-marches 16 sectors per cell and interpolates harmonically in 1/fetch; the
   idealized channel is from=>fetchKm(from,L,W)), the fan + physics belong here. Reads NO module
   state except blockModel via hazard() when model is omitted — pass model explicitly from bulk
   callers. Uses hazard()'s fast band-only path (see hazSpec): full-envelope fan measured 2.1 s
   per 6,200 cells vs the map's ~300 ms budget. The worst<4 early-exit is kept from the map's
   old fan (band can't exceed 4) though in spec mode band 4 is unreachable via S (S saturates at
   1/7 < 0.143 — Force_Explorer_Sensitivity_Analysis.md).
   Returns {band, dom:{Hs,Tp,from,Fkm}} — band -1 = negligible sea; dom feeds the hover readout.
   Proved ≡ compute() in band AND dom on the idealized channel (test/physics_regression.mjs). */
function steepCell(Ums, windFromDeg, curKt, curToward, fetchAtKm, model){
  let dom=null, worst=-1;
  for(let d=-80; d<=80; d+=5){
    const Ueff=Ums*Math.cos(d*Math.PI/180); if(Ueff<0.3) continue;
    const from=((windFromDeg+d)%360+360)%360;
    // the km→m→km round-trip mirrors compute() exactly, so dom.Fkm is BIT-identical to compute()'s
    const F=fetchAtKm(from)*1000, w=windSea(Ueff,F);
    if(!dom||w.Tp>dom.Tp) dom={Hs:w.Hs,Tp:w.Tp,from,Fkm:F/1000};
    if(!(w.Hs>0.05)) continue;
    if(worst<4){ const h=hazard(w.Hs,w.Tp,from,curKt,curToward,model,true);
      if(h.band>worst) worst=h.band; }
  }
  if(worst<0){                       // calm / no viable component — compute()'s fallback, verbatim
    const F=fetchAtKm(windFromDeg)*1000, w=windSea(Ums,F);
    const h=hazard(w.Hs,w.Tp,windFromDeg,curKt,curToward,model,true);
    dom={Hs:w.Hs,Tp:w.Tp,from:windFromDeg,Fkm:F/1000}; worst=h.band;
  }
  return {band:worst, dom}; }
/* DIRECTIONAL (QUARTERING-SEA) HAZARD — a SEPARATE model, deliberately NOT folded into the
   steepness band. Steepness measures whether the sea BREAKS; it says nothing about the ANGLE the
   waves hit a kayak, and capsize literature says danger ≈ breaking × bad-angle: a non-breaking wave
   mostly rolls under the hull, while a BREAKING wave on the beam is the capsizer (Adlard Coles:
   breaking height ≳ beam ⇒ knockdown), and IMO MSC.1/Circ.1228 defines the dangerous heading band
   as 135–225° off head sea — stern-quartering + following — where broach/surf-ride live. For a
   kayak, stern-quartering is the worst single heading: it stacks the following-sea broach on the
   beam-sea roll while denying the paddler a pre-committed brace side. Kept separate because the
   steepness/blocking chain is validated (monotone sweeps, ray parity, audit) and an angle term
   inside its band would change every verdict and risk new anomalies; also because encounter
   geometry is a per-HEADING question — its natural output is a rose, not one number.
     Q(heading) = max over components of  W(angle off bow) × breakingProximity × size,
   then × a confused-sea multiplier. W anchors (literature-informed, calibration targets for the
   replay reviewers): head 0.15, bow-quarter 0.40, beam 0.85, stern-quarter 1.00, following 0.55.
   breakingProximity ramps on component steepness 0.04→0.12 (and breaking fraction in spectral
   mode) — so the quartering hazard MATERIALIZES when opposing current steepens the sea: the
   oblique-wind + axial-current cell that steepness alone under-rates, because wind sets wave
   DIRECTION while current sets BREAKING. Both breaking and size are taken as a per-component
   running-max ENVELOPE over currents 0…now (see compEnv), so Q is monotone in opposing current by
   construction. The spread factor is the DIRECTIONAL WIDTH of the wind sea itself, from CALM-sea
   component heights (current-independent ⇒ cannot create current inversions): a wind sea spanning
   ≥40° of direction is short-crested with no single brace side, escalate ×(1+0.3·ramp). NB this is
   the fan of one wind sea, not two crossing swells (the idealized model has no swell input); true
   crossing-sea rogue-wave danger (40–60°, NHESS 17,2041) needs the multi-modal sea of the real map. */
const QW_ANCH=[[0,0.15],[45,0.40],[90,0.85],[135,1.00],[165,0.75],[180,0.55]];
function qWeight(r){ r=Math.abs(r);
  for(let i=1;i<QW_ANCH.length;i++){ const [r0,w0]=QW_ANCH[i-1],[r1,w1]=QW_ANCH[i];
    if(r<=r1) return w0+(w1-w0)*(r-r0)/Math.max(r1-r0,1e-9); }
  return QW_ANCH[QW_ANCH.length-1][1]; }
const angDiff=(a,b)=>{ const d=Math.abs(((a-b)%360+360)%360); return d>180?360-d:d; };
const clamp01=v=>Math.min(Math.max(v,0),1);
/* Per-component ENVELOPE of (breaking × size) over opposing currents 0…now — the running-max
   principle the steepness consequence gate already uses. This is what makes Q monotone in current
   BY CONSTRUCTION and robust to the different clamping in haz() vs hazSpec(): a component whose
   relationship to the axial current is FOLLOWING (its steepness falls as the current grows — real,
   correct physics) can't drag the directional hazard down, because a paddler at the blocking/rip
   zone meets the PEAK of the transition, not its flattened tail. breaking = max(steepness ramp
   0.04→0.12, spectral breaking fraction); size = envelope height 0.15→0.5 m (gateH in spec, Hamp
   in mono). Heading-independent, so it's computed once per component and reused across the rose. */
/* WHITECAPPING floor (prototype 2026-07-15). An actively forced wind sea breaks on its own —
   whitecaps appear from ~8 kt of wind (Beaufort 3) and are widespread by ~22 kt (B5-6) —
   independent of any opposing current. Without this floor the model knew only CURRENT-induced
   breaking, so a FOLLOWING current zeroed the quartering hazard of a whitecapping sea entirely
   (found by David 2026-07-15: 15 kt NE wind over a 1.7 kt S-setting flood read "none" for the
   S-bound paddler despite a stern-quartering Beaufort-4 sea). Linear expert ramp on the wind
   actually blowing over the water (c.Uw, stored by compute(); components without Uw — e.g. the
   test harness's fabricated seas — get 0, keeping pure current-steepening analyses unchanged).
   Constant in current ⇒ Q's monotonicity in opposing current is preserved. The 8→22 kt anchors
   are expert judgment (Beaufort whitecap descriptions), calibration targets for the replay
   review exactly like the W anchors. */
const whitecap=Ukt=>clamp01((Ukt-8)/14);
function compEnv(c,curKt,curToward,model){
  const wc=PROTO.whitecap?whitecap(c.Uw||0):0;   // experimental toggle; OFF ⇒ floor inert
  let bz=0,Hamp=0,brk=0; const top=Math.ceil(Math.abs(curKt)/0.1)*0.1+1e-9;
  for(let V=0;V<=top;V+=0.1){ const h=hazard(c.Hs,c.Tp,c.from,V,curToward,model);
    if(!h||!(h.Hamp>0.05)) continue;
    const b=Math.max(clamp01((h.S-0.04)/(0.12-0.04)), h.fBrk||0, wc);
    const z=clamp01(((h.gateH!=null?h.gateH:h.Hamp)-0.15)/(0.5-0.15));
    if(b*z>=bz){ bz=b*z; Hamp=h.Hamp; brk=b; } }
  return {bz,Hamp,brk}; }
function quarterHaz(comps,t,curKt,curToward,model){         // t = paddler heading (course steered)
  let Q=0, gov=null;
  for(const c of comps){ const e=c._env||(c._env=compEnv(c,curKt,curToward,model));
    if(!(e.bz>0)) continue;
    const r=angDiff(c.from,t);                              // 0 = head sea … 180 = following
    const en=PROTO.surf?encounter(c,r):1;                   // surf/broach amplifier (≥1, current-independent; experimental toggle)
    const q=qWeight(r)*e.bz*en;
    if(q>Q){ Q=q; gov={from:c.from,r,Hamp:e.Hamp,b:e.brk,q,en}; } }
  return {Q:Math.min(1,Q),gov}; }                           // clamp: amplifier can push a component past 1
function confusedSpread(comps){                             // from CALM heights: current-independent
  const sig=comps.filter(c=>c.Hs>=0.15);
  const hMax=sig.reduce((m,c)=>Math.max(m,c.Hs),0);
  const s2=sig.filter(c=>c.Hs>=0.4*hMax);
  let sp=0; for(let i=0;i<s2.length;i++) for(let j=i+1;j<s2.length;j++)
    sp=Math.max(sp,angDiff(s2[i].from,s2[j].from));
  return sp; }
/* ENCOUNTER / SURF-BROACH amplifier (prototype 2026-07-15). The stern-quartering capsize David
   describes is a broach: an overtaking crest lifts and DRIVES the stern while the bow sits in the
   slower trough, slewing the boat beam-on. Two things decide whether a wave can do this, and
   NEITHER is paddler speed — David's point: a loaded sea kayak can't reach a wind-wave's celerity
   (c = 1.56·Tp ≈ 4–5 m/s vs a ~1.5 m/s hull speed), and the corrective stern draw/rudder only
   SLOWS it further, so we credit no escape-by-speed and take no speed input at all. What matters:
     1) the wave must be OVERTAKING — coming from abaft the beam (gate 0 at/ahead of the beam,
        full by the stern quarter); a bow sea can't surf you. This is heading-dependent (r).
     2) the wave must be long enough to DRIVE the hull, not just chop it — wavelength λ=1.56·Tp²
        (deep water, CALM Tp) relative to boat length: no drive at λ≈L, full drive by λ≈3L. Much
        longer swell just lifts the boat bodily (also fine here — it saturates, doesn't keep rising).
   So E = 1 + 0.35·overtakeGate(r)·lengthRamp(λ/Lboat), a modest amplifier on the per-component
   b·z. It is CURRENT-INDEPENDENT (λ from calm Tp, r from geometry, L from the boat slider) ⇒ it
   cannot create a current inversion; Q stays monotone in opposing current by construction. Boat
   length is the one boat-specific parameter that's actually knowable (unlike hull drag / righting
   moment), so it's the honest place to admit hull specifics. The 0.35 amplitude and the 1→3·L
   band are expert anchors — replay-review calibration targets like the W and whitecap anchors. */
function encounter(c,r){
  const Lboat=ENV.B||5;                           // boat waterline length (m); sea-kayak default
  const lam=1.5613*c.Tp*c.Tp;                     // deep-water wavelength (m) from CALM Tp
  const go=clamp01((r-90)/45);                     // overtaking: 0 at/ahead of beam, 1 by stern quarter
  const lr=clamp01((lam/Lboat-1)/2);              // 0 at λ=L (no drive), 1 at λ=3L (full surf drive)
  return 1+0.35*go*lr; }
const qBand=q=> q>=0.75?4:q>=0.5?3:q>=0.28?2:q>=0.12?1:0;
// Confused-sea multiplier on Q (spread wind sea = short-crested, no single brace side; applied
// by the explorer's render(), fe_api's evalPoint, and the harness oracles). SINGLE SOURCE OF
// TRUTH — the 0.3/40°/40° literals were previously duplicated in render() and two harnesses.
// QMULT is an object (not inline literals) so the sensitivity "mult" stage can perturb it live.
const QMULT={amp:0.3, th:40, span:40};
const qMult=sp=>1+QMULT.amp*clamp01((sp-QMULT.th)/QMULT.span);
