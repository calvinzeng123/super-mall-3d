// How many distinct plans (planSignature) the current generator yields per 西苑 slot and type over variants 0–31,
// and whether a top-floor duplex (复式) generates in a 9.0 / 8.4 m-deep slot.
const root = process.argv[2];
const { generateHome, generateDuplex, validateHome, planSignature: sig } = await import(root + '/src/layout/community-plan.js');
const SL = { W1: { SW: 17.0, S: 10.6, SE: 15.8, NW: 14.4, NE: 11.0 }, W2: { SW: 14.6, S: 11.2, SE: 17.6, NW: 11.6, NE: 13.8 } };
const geo = (slot) => slot[0] === 'S' ? { d: 9.0, exposed: { left: slot === 'SW', right: slot === 'SE' } } : { d: 8.4, balcony: false, exposed: { left: slot === 'NE', right: slot === 'NW' } };
for (const [tid, slots] of Object.entries(SL)) for (const [slot, w] of Object.entries(slots)) {
  const line = [];
  for (const type of ['2BR', '3BR', '4BR']) for (const lux of [false, true]) {
    const sigs = new Set(); let errs = 0;
    for (let v = 0; v < 32; v++) { const spec = { id: 'x', type, w, ...geo(slot), lux, variant: v }; const g = generateHome(spec); if (g) { sigs.add(sig(g.residence)); errs += validateHome(g.residence, spec).length ? 1 : 0; } }
    if (sigs.size) line.push(`${type}${lux ? '·lux' : ''} ${sigs.size}${errs ? ` (${errs} err)` : ''}`);
  }
  console.log(`${tid} ${slot} ${w}×${geo(slot).d}: ${line.join(', ') || 'none'}`);
}
const t0 = Date.now(); let ok = 0, tried = 0;
for (const [tid, slots] of Object.entries(SL)) for (const [slot, w] of Object.entries(slots)) for (const type of ['3BR', '4BR']) {
  tried++;
  let d = null;
  for (let v = 0; v < 8 && !d; v++) for (const lux of [false, true]) { if (d) break; d = generateDuplex({ id: `${tid}-${slot}`, type, w, ...geo(slot), lux, variant: v, entryAt: w / 2, view: 'left' }, { tries: 40 }); }
  if (d) ok++;
  console.log(`duplex ${tid} ${slot} ${type}: ${d ? `${d.lower.residence.area}+${d.upper.residence.area} m²` : 'none'}`);
}
console.log(`duplexes ${ok}/${tried} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
