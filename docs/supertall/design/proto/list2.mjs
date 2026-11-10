const r2 = (v) => Math.round(v * 100) / 100;
for (const [id, top, crown] of [['T1', 48, 13], ['T2', 44, 11]]) {
  const rows = []; let y = 34.0;
  const add = (s, h, use) => { rows.push(`| ${s} | ${y.toFixed(1)} | ${h.toFixed(1)} | ${use} |`); y = r2(y + h); };
  add('7F', 5.0, '空中大堂 + 住户会所 (kept, sky-lobby spec)');
  for (const n of [8, 9]) add(`${n}F`, 3.6, '江景大平层 W / E (kept)');
  add('10F', 3.6, '**R1 避难层** (was 10W / 10E)');
  for (const n of [11, 12, 13]) add(`${n}F`, 3.6, '江景大平层 W / E (kept)');
  for (let n = 14; n <= 23; n++) add(`${n}F`, 3.3, n === 14 ? '14–15W lower · 14E single-level (kept)' : n === 23 ? '22–23W upper (kept) · **23E single-level (new)**' : `${n % 2 ? `${n - 1}–${n}W upper · ${n}–${n + 1}E lower` : `${n}–${n + 1}W lower · ${n - 1}–${n}E upper`} (kept)`);
  add('24F', 5.4, '**R2 避难层 + 设备层 + 伸臂/环带** (was 24W / 23–24E)');
  for (let n = 25; n <= 35; n++) add(`${n}F`, 3.9, '云端大平层 W / E (new)');
  add('36F', 5.4, '**R3 避难层 + 设备层 + 伸臂/环带**');
  for (let n = 37; n <= top; n++) { const lo = n % 2 === 1, ph = n >= top - 1; add(`${n}F`, 3.3, `${ph ? '顶层复式' : '空中大宅'} ${lo ? `${n}–${n + 1}` : `${n - 1}–${n}`} W + E ${lo ? 'lower (entry)' : 'upper'} (new)`); }
  rows.push(`| RF | ${y.toFixed(1)} | 3.2 | 屋顶设备层 + 两户私家屋顶露台; crown fins to ${(y + crown).toFixed(1)} |`);
  console.log(`\n### ${id}\n\n| floor | elev m | storey m | use |\n|---|---:|---:|---|\n${rows.join('\n')}`);
}
