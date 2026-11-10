// Revised stack (aligned with codes.md): R1 10F 46.2 (3.6), R2 24F 93.6 (5.4), R3 36F 141.9 (5.4).
// Kept: 8F 9F 11F 12F 13F flats, 14F–23F interlock (14E start, 23E end flat). New: 25F–35F 云端大平层 (3.9),
// 37F.. aligned two-level 空中大宅, top pair 顶层复式. Variant '150': stop after the C band (RF where R3 was).
const r2 = (v) => Math.round(v * 100) / 100;
function stack(top, variant = '200') {
  const L = []; let y = 34.0;
  const add = (n, h, kind, band) => { L.push({ short: n === 'RF' ? 'RF' : `${n}F`, n, elev: r2(y), height: h, kind, band }); y = r2(y + h); };
  add(7, 5.0, 'club', 'sky');
  for (const n of [8, 9]) add(n, 3.6, 'community', 'L');
  add(10, 3.6, 'refuge', 'R1');
  for (const n of [11, 12, 13]) add(n, 3.6, 'community', 'L');
  for (let n = 14; n <= 23; n++) add(n, 3.3, 'community', 'D');
  add(24, 5.4, 'refuge', 'R2');
  const cTop = variant === '150' ? top : 35;
  for (let n = 25; n <= cTop; n++) add(n, 3.9, 'community', variant === '150' && n >= cTop - 1 ? 'PH' : 'C');
  if (variant !== '150') {
    add(36, 5.4, 'refuge', 'R3');
    for (let n = 37; n <= top; n++) add(n, 3.3, 'community', n >= top - 1 ? 'PH' : 'H');
  }
  add('RF', 3.2, 'roof', 'RF');
  return L;
}
function homes(id, L) {
  const H = [], band = (n) => L.find((l) => l.n === n)?.band;
  for (const n of [8, 9, 11, 12, 13]) for (const s of ['W', 'E']) H.push({ side: s, levels: [n], kind: 'flat', band: 'L', keep: true });
  H.push({ side: 'E', levels: [14], kind: 'flat', band: 'D', keep: true });
  for (let n = 14; n <= 22; n++) H.push({ side: n % 2 ? 'E' : 'W', levels: [n, n + 1], kind: 'duplex', band: 'D', keep: true });
  H.push({ side: 'E', levels: [23], kind: 'flat', band: 'D', keep: false });
  const C = L.filter((l) => l.band === 'C').map((l) => l.n);
  for (const n of C) for (const s of ['W', 'E']) H.push({ side: s, levels: [n], kind: 'flat', band: 'C' });
  const T = L.filter((l) => l.band === 'H' || l.band === 'PH').map((l) => l.n);
  for (let i = 0; i < T.length; i += 2) for (const s of ['W', 'E']) H.push({ side: s, levels: [T[i], T[i] + 1], kind: L.find((l) => l.n === T[i]).band === 'PH' ? 'penthouse' : 'sky-duplex', band: band(T[i]) });
  return H;
}
const out = {};
for (const [id, top, crown, variant] of [['T1', 48, 13, '200'], ['T2', 44, 11, '200'], ['T1', 35, 10, '150'], ['T2', 33, 10, '150']]) {
  const L = stack(top, variant), rf = L.at(-1), R = L.filter((l) => l.kind === 'refuge'), occ = L.filter((l) => l.kind === 'community').at(-1);
  const H = homes(id, L), units = H.reduce((n, h) => n + h.levels.length, 0);
  const entry = (s) => [...new Set(H.filter((h) => h.side === s).map((h) => h.levels[0]))].sort((a, b) => a - b);
  const LW = ['B2', 'B1', '1F', '7F', ...entry('W').map((n) => `${n}F`), 'RF'], LE = ['B2', 'B1', '1F', '7F', ...entry('E').map((n) => `${n}F`), 'RF'];
  const own = L.map((l) => l.short), LF = ['B2', 'B1', '1F', ...own];
  // max consecutive own floors skipped by a private lift (GB 50096 §6.4.4: ≤ 2)
  const skip = (stops) => { const ns = stops.filter((s) => /^\d+F$/.test(s)).map((s) => parseInt(s)).filter((n) => n >= 7); let m = 0; for (let i = 1; i < ns.length; i++) m = Math.max(m, ns[i] - ns[i - 1] - 1); return m; };
  const per = {}; for (const h of H) for (const n of h.levels) per[n] = (per[n] || 0) + 1;
  const bad = L.filter((l) => l.kind === 'community' && per[l.n] !== 2).map((l) => l.short);
  const pop = (band, k) => H.filter((h) => h.band === band).length * k;
  console.log(`\n${id} v${variant}: levels ${L.length} (7F–${occ.short}+RF) RF ${rf.elev} crown ${r2(rf.elev + crown)} | refuge ${R.map((l) => `${l.short}@${l.elev}/${l.height}`).join(' ')} | gaps ${R.map((l, i) => r2(l.elev - (i ? R[i - 1].elev : 0))).join(' / ')} | top occ ${occ.short}@${occ.elev} (+${r2(occ.elev - R.at(-1).elev)} over last R)`);
  console.log(`  H/B above podium ${r2((rf.elev - 34) / 16)} from ground ${r2(rf.elev / 16)} | homes ${H.length} (kept ${H.filter((h) => h.keep).length}, new ${H.filter((h) => !h.keep).length}) units ${units} two-level ${H.filter((h) => h.levels.length === 2).length} | per side W ${H.filter((h) => h.side === 'W').length} E ${H.filter((h) => h.side === 'E').length} | floors w/o 2 homes: ${bad.join(',') || 'none'}`);
  console.log(`  by band ${JSON.stringify(H.reduce((m, h) => (m[h.band] = (m[h.band] || 0) + 1, m), {}))}`);
  console.log(`  LW ${LW.length}: ${LW.join(' ')}  (max skip ${skip(LW)})`);
  console.log(`  LE ${LE.length}: ${LE.join(' ')}  (max skip ${skip(LE)})`);
  console.log(`  LF/LS ${LF.length} | LF 5 m/s 1F→RF ${(rf.elev / 5 + 5).toFixed(1)} s | private 6 m/s 1F→${occ.short} ${(occ.elev / 6 + 6).toFixed(1)} s | game Δy/7 ${(occ.elev / 7).toFixed(1)} s, Δy/12 ${(occ.elev / 12).toFixed(1)} s`);
  out[`${id}-${variant}`] = L;
}
// floor tables for the two 200 m stacks
for (const k of ['T1-200', 'T2-200']) {
  const L = out[k];
  console.log(`\n${k}\n` + L.map((l) => `${l.short}@${l.elev}(${l.height},${l.band})`).join(' '));
}
