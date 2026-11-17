import * as THREE from 'three';
import { pbrOptions } from './pbr.js';

// Outdoor versions share the exact local CC0 texture objects with the interior
// library. They never glow as stone/brick at night and allocate no new images.
export const FACADE_SURFACES = Object.freeze({
  metroTile: { id: 'glazed_wall_tiles', roughness: 1, normal: .5 }, // 粗糙度由贴图给（釉面亮、砖缝糙）
  metroTunnel: { id: 'tunnel_concrete', roughness: .92, normal: .45 },
  facadeStone: { id: 'marble_01', roughness: 0.72, normal: 0.18 },
  facadeConcrete: { id: 'concrete_pavement_02', roughness: 0.95, normal: 0.24 },
  facadeBrick: { id: 'brick_wall_09', roughness: 0.96, normal: 0.5 },
  facadeTimber: { id: 'oak_wood_planks', roughness: 0.8, normal: 0.25 },
  // CC0 scans from assets/textures/scans (Poly Haven, ambientCG): colour + normal only,
  // so the roughness is the scalar here.
  facadeTravertine: { id: 'travertine_cladding', roughness: 0.68, normal: 0.7 },
  facadeTerracotta: { id: 'ribbed_cladding', roughness: 0.72, normal: 0.9 },
  facadeBronze: { id: 'brushed_metal', roughness: 0.38, normal: 0.35, metalness: 0.72 },
  roofTile: { id: 'clay_roof_tiles', roughness: 0.7, normal: 1 },
  facadePlaster: { id: 'painted_plaster', roughness: 0.86, normal: 0.4 },
  facadeBoardConcrete: { id: 'formed_concrete', roughness: 0.88, normal: 0.6 },
  facadeSlat: { id: 'timber_slats', roughness: 0.7, normal: 0.8 },
});

export function createFacadeMaterials(surfaces, onNight = () => {}) {
  const materials = {};
  for (const [key, spec] of Object.entries(FACADE_SURFACES)) {
    const asset = surfaces[spec.id];
    const material = new THREE.MeshStandardMaterial({ vertexColors: true,
      roughness: spec.roughness, metalness: spec.metalness || 0, ...(asset ? pbrOptions(asset, spec.normal) : {}) });
    material.name = `${key} · ${spec.id} · CC0`;
    material.userData = { surface: spec.id, source: asset?.sourceUrl, license: 'CC0-1.0', outdoor: true };
    materials[key] = material;
  }
  // Use only the fine roughness variation for coated metal; concrete color and
  // normal are deliberately not copied onto aluminium window frames.
  materials.facadeFrame = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.55,
    roughnessMap: surfaces.concrete_pavement_02?.maps.roughness || null });
  materials.facadeFrame.name = 'Powder-coated aluminium · shared CC0 roughness';
  materials.facadeWindow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.48, envMapIntensity: 1.45 });
  materials.facadeWindow.name = 'Recessed exterior glass';
  materials.facadeWindowLit = materials.facadeWindow.clone();
  materials.facadeWindowLit.name = 'Occupied exterior window';
  materials.facadeWindowLit.emissive.set('#ffe0ae');
  materials.facadeWindowLit.emissiveIntensity = 0;
  onNight(t => { materials.facadeWindowLit.emissiveIntensity = t * 0.65; });
  return materials;
}
