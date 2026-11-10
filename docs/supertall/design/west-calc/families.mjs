// Feasibility of the proposed 西苑 plan families with the existing generator (community-plan.js), slots after the core grows to 18.0 m.
const root = process.argv[2];
const { generateHome, generateDuplex, validateHome, planSignature: sig } = await import(root + '/src/layout/community-plan.js');
const S = (slot) => ({ exposed: { left: slot === 'SW', right: slot === 'SE' }, d: 9.0 });
const N = (slot) => ({ exposed: { left: slot === 'NE', right: slot === 'NW' }, d: 8.4, balcony: false });
const row = (slot) => (slot[0] === 'S' ? S(slot) : N(slot));
// [tower, family, slot, type, width, lux]
const FAM = {
  W1: { slots: { SW: 17.0, S: 10.6, SE: 15.8, NW: 14.4, NE: 11.0 },
    A: [['SW', '4BR'], ['S', '2BR'], ['SE', '3BR'], ['NW', '3BR'], ['NE', '2BR']],
    B: [['SW', '4BR'], ['S', '2BR'], ['SE', '3BR'], ['NW', '3BR'], ['NE', '2BR']],
    C: [['SW', '4BR', true], ['S', '3BR'], ['SE', '4BR'], ['NW', '3BR'], ['NE', '2BR', true]],
    D: [['SW', '3BR', true], ['S', '2BR', true], ['SE', '3BR', true], ['NW', '3BR', true], ['NE', '2BR', true]] },
  W2: { slots: { SW: 14.6, S: 11.2, SE: 17.6, NW: 11.6, NE: 13.8 },
    A: [['SW', '3BR'], ['S', '2BR'], ['SE', '4BR'], ['NW', '2BR'], ['NE', '3BR']],
    B: [['SW', '3BR'], ['S', '2BR'], ['SE', '4BR'], ['NW', '2BR'], ['NE', '3BR']],
    C: [['SW', '4BR'], ['S', '3BR'], ['SE', '4BR', true], ['NW', '2BR', true], ['NE', '3BR']],
    D: [['SW', '3BR', true], ['S', '2BR', true], ['SE', '4BR', true], ['NW', '2BR', true], ['NE', '3BR', true]] },
};
const VAR = { A: 0, B: 5, C: 9, D: 13 };
const out = {};
for (const [tid, T] of Object.entries(FAM)) {
  const used = new Set(), tsigs = [];
  for (const fam of ['A', 'B', 'C', 'D']) {
    const res = [];
    for (const [slot, type, lux] of T[fam]) {
      let got = null;
      const t0 = Date.now();
      for (let v = VAR[fam] + (tid === 'W2' ? 3 : 0); v < VAR[fam] + 24 && !got; v++) {
        const spec = { id: `${tid}-${fam}-${slot}`, type, w: T.slots[slot], ...row(slot), lux: !!lux, variant: v };
        const g = generateHome(spec);
        if (!g) continue;
        const k = sig(g.residence);
        if (used.has(k)) continue;   // every plan distinct within the tower
        got = { spec, g, k, errs: validateHome(g.residence, spec) };
      }
      if (got) { used.add(got.k); tsigs.push(got.k); }
      res.push(got ? `${slot} ${got.g.residence.label}${lux ? '·lux' : ''} ${got.g.residence.area}m² v${got.spec.variant} ${got.errs.length ? 'ERR ' + got.errs.join(';') : 'ok'} ${Date.now() - t0}ms` : `${slot} ${type} NO PLAN`);
    }
    console.log(`${tid} ${fam}: ${res.join(' | ')}`);
  }
  // Top-floor duplexes (复式) per slot, lower + upper.
  const dres = [];
  for (const [slot, type] of [['SW', tid === 'W1' ? '5BR' : '4BR'], ['S', '3BR'], ['SE', tid === 'W1' ? '4BR' : '5BR'], ['NW', tid === 'W1' ? '4BR' : '3BR'], ['NE', tid === 'W1' ? '3BR' : '4BR']]) {
    const t0 = Date.now();
    let d = null;
    for (let v = 0; v < 12 && !d; v++) {
      const spec = { id: `${tid}-PH-${slot}`, type, w: T.slots[slot], ...row(slot), lux: true, variant: v, voidAbove: slot[0] === 'S' && v < 6 };
      d = generateDuplex(spec);
      if (d) d.spec = spec;
    }
    dres.push(d ? `${slot} ${type} ${d.lower.residence.area}+${d.upper.residence.area}m²${d.voidRect ? ' 挑空' : ''} ${[...validateHome(d.lower.residence, { ...d.spec, level: 'lower' }), ...validateHome(d.upper.residence, { ...d.spec, level: 'upper' })].length ? 'ERR' : 'ok'} ${Date.now() - t0}ms` : `${slot} ${type} NO DUPLEX ${Date.now() - t0}ms`);
  }
  console.log(`${tid} PH: ${dres.join(' | ')}`);
  console.log(`${tid}: ${new Set(tsigs).size}/${tsigs.length} distinct flat plans`);
}
