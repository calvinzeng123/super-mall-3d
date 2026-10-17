import { pointInPoly, polyBounds } from '../layout/geom.js';

/** One small support index per populated level, shared by all its actors. It
 * only describes real floor plates and openings, not player walls/collisions. */
export function createPeopleSupport(level, extraPieces = [], radius = .2) {
  const compile = poly => ({ poly, bb: polyBounds(poly) });
  const pieces = [...level.slab.pieces, ...extraPieces].map(piece => ({
    ...compile(piece.outer), holes: (piece.holes || []).map(compile),
  }));
  const voids = (level.voids || []).map(v => compile(v.poly));
  const diagonal = radius / Math.SQRT2;
  const samples = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
    [diagonal, diagonal], [-diagonal, diagonal], [diagonal, -diagonal], [-diagonal, -diagonal]];
  const point = [0, 0];
  const contains = record => point[0] >= record.bb.x0 && point[0] <= record.bb.x1
    && point[1] >= record.bb.z0 && point[1] <= record.bb.z1 && pointInPoly(point, record.poly);
  return (x, z, escalator = false) => {
    // Escalator paths already follow the actual sloped tread height. Testing
    // them against a flat floor would hide passengers over the intended slot.
    if (escalator) return true;
    for (const [dx, dz] of samples) {
      point[0] = x + dx; point[1] = z + dz;
      if (voids.some(contains)) return false;
      let supported = false;
      for (const piece of pieces) if (contains(piece) && !piece.holes.some(contains)) {
        supported = true; break;
      }
      if (!supported) return false;
    }
    return true;
  };
}
