// Campus totals of the expansion layout before the supertall work (branch head e6948b9), the base of
// tests/campus-deltas/index.js. Each tower package adds its own delta file next to this one
// (north.js, west.js, r.js, ha.js: SPEC §2.1 "campus deltas") and never edits this file.
//
// expansionGroups: sha256 of every record group of buildLayout({ expansion: true }) at e6948b9
// (tests/support/layout-groups.js; the keys P0a adds on purpose are stripped first). A package that changes
// a group on purpose lists it in its delta's expansionChanged; tests/expansion-additive.test.js checks the rest.
export default {
  levels: 338, lifts: 76, stairs: 106, shops: 664, records: 1066, homes: 1046, west: 270, north: 48,
  gates: 16, zones: 14,
  // H + A + R residence records walked by residence-access.test.js / suite-nav.test.js
  residenceAccess: 728,
  // [id, building] of every hardstand in site.fireAccess (西苑's HS-W1 / HS-W2 live in site.westGarden.hardstands)
  hardstands: [['HS1', 'T1'], ['HS2', 'T2']],
  // Gated towers checked by tests/no-bypass.test.js: { tower, floors? (protected level ids; default: its own
  // levels with homes), starts? (extra public points [{ floor, x, z }]) }. Each package appends its own towers.
  noBypass: [{ tower: 'T1' }, { tower: 'T2' }, { tower: 'W1' }, { tower: 'W2' }],
  // Buildings whose records are identical in the compact and expansion layouts (p1-expansion-layout.test.js)
  compactIdentical: { keep: ['P2', 'P3', 'H', 'A', 'R1', 'R2', 'R3', 'R4'] },
  expansionGroups: {
    P1: 'a933ee8f16b8b6f08722ff873df6055c72c87894f980ba54db6162526080cf46',
    P2: '1d250704f1259e6e54ccf53da00208852fdd071af39bc0a9ee06c358573f5fad',
    P3: 'b89e4829c5ff7a28c5ba9d27d4b9263f5d502e821f0764050999774d5610244c',
    M: '97379389ccc52d411cf23a8415ef578541ba894eabb2097798242b9d961ef657',
    H: '8702110b64f5792fd03575b879ba1408075afb7a13ada61a6b60f7259ea69ece',
    A: '70d59bf7c8655c506f80dae9319d3e1d584f0c6bb3034bf82b6c4fc62d5e6bb2',
    R1: 'b4423c799ee5c280287eb74e663ef99f6369cda8ee3435db6d347cb2afd01f12',
    R2: '91390c054b3d40fa836ba0e0bd55784a3396176b5850d23eee7980ea885fdfb8',
    R3: '3831ed0aebdf855a7a27eb2816d259851d16490985ac7905a838334434de61c1',
    R4: '9db481b869a3c4db5d8b18723775de4630ed0dbdcce6c6ec6fca0d711fc81604',
    WPG: '34b1f9e2eb8e70b0f7e323a4df8575dd1e69073a25acda3f9b00a2cda3749213',
    W1: '8b936abac882db4d5abf0d22931cfc290157b46ed64cffb45e7ef555a132a424',
    W2: '484b8448321d9bb8d5716bc65af630470b521954888e095a7d707ade0b353b9f',
    P1C: '7bed1a323c3e971f6915255c4d976ed65099b4a1caa048187dc2c67d38883be3',
    P1S: '73aa4c2f5c0b09e8debf827d644e144f0e95e2cc02268ea529145ea4ad9100ba',
    P1E: 'f50b977dcd8dead1e971d9ea2b8b64e18de66b1ec0ee8a29ca265594d0d125af',
    P1E2: 'd173619689ba8a8a0a64ef610baaf4bd834181decfc2b32034a3c80574249e99',
    P1W1: '750bb91b91e5f498ade961c91c9c0814272b0daabde0f1aa78c85e6b5980d182',
    P1W2: 'b81e37948554206d865d0b14300a21835a7e2a33e2e9f741c1363e5079df0545',
    P1W3: '634dd932030fb66d9c1e5819534cb8889f0b18f3cdd24510cf4c2826f2c6ed1b',
    P1W4: '3cc790ecb2dbbf77aad208d38c0ce878d28496fa15e16beb843a5cfa025d8790',
    T1: '33e246e32fe6f5e0ebbc2669104fdf739deceec355fac0a1dc5492f85f592f5e',
    T2: '84cc71059427e1aa95fa8ef7f9cbfa42b05b87eebff9572dc6d6c37faae0ef39',
    site: '83618bbfaa4e2cfe4c0d1fd2bcdb63ff09419650702db4f123e2f0fb92120626',
    bridges: '2c1d6ccddf126106cd4337b451c9cba1fa1d6df52cd48df8d838ffb85e0709ca',
    categories: 'cf8f1f6c881c9d3d3bbd4f37909c792dd37c71284e9c6e4b63218e70de4988f7',
    extensions: 'ecb9126c5a973a39d35d8c8e45e6465d629dc890147f2126de14da83749efbc1',
    accessControl: '2430f1a2ad2982d0067885488a4c89e21ad1d7c83b115ba8f1b20acc88dfaea8',
    sharedGarages: '8fb15a465827fcf1f0bb549937303c46149ba7308b8b5b5979415d4bb3a95f0e',
    expansion: 'ec27eed0c365bfda24cbe4590f4a06f180f7dd8c2f4c12f784c0941f26e81f15',
    fidelity: '1e91f72c0a4f72f02f2e6251de7428ac5722c55b32f066d502a91a9bd57fe834',
    northResidences: 'e8bb93866204346dbfeda8a7b1b87d3a5397f841b75f71f05a676ceb2cceaa49',
    finishes: '4e07327dcbdf38b02703b45e5fc46eabc92fe70b6f9af230c2410c62de6ee2e4',
  },
};
