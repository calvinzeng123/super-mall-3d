// 云澜酒店 H / 云澜服务公寓 A 超高层（expansion layout only）. Stub created by P0a; the hotel and apartment
// package (P-HA) owns this file.
//
// Contract (SPEC §2.1 "supertall dispatch"): buildHospitality({ expansion: true }) calls
// supertallTower(spec, ctx) for every HOSPITALITY.towers entry that supertallResidential() left null:
//   - return null to keep the compact tower(spec) (today);
//   - otherwise return a part { building, levels, stairs, elevators, escalators, ramps, entrances,
//     access: { zones, gates }, fireAccess: [hardstandRecord(…)] } (access → layout.accessControl,
//     fireAccess → site.fireAccess). ctx: { site, expansion }.
// Rule C-13: the supertall fields go only on records this module creates (see r-supertall.js).
export function supertallTower(spec, ctx = {}) {
  return null;
}

/**
 * Expansion-only site pass, called once at the end of buildLayout({ expansion: true }) (before the lift
 * shafts are cut). P-HA tags the 20 west-lot 酒店短停 bays here (stall `type` stays, `hotelShortStay: true`
 * is added), so west-parking.js stays untouched.
 */
export function supertallSitePass(layout) {
  // <supertall:HA>
  // </supertall:HA>
}
