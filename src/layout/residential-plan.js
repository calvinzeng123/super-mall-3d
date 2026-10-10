import { RESIDENTIAL_PLAN_DATA } from './residential-plan-data.js';

/** Immutable shared geometry metadata: each unit only supplies its world frame. */
export function createResidentialPlan(prototype) {
  const plan = RESIDENTIAL_PLAN_DATA[prototype];
  if (!plan) throw new Error(`Unknown residential prototype ${prototype}`);
  return { ...plan };
}

export const RESIDENTIAL_SLOTS = [
  { slot: 1, prototype: '01', x: -19.4, z: 1.6, rotation: 0 },
  { slot: 2, prototype: '02', x: 3.8, z: 1.6, rotation: 0 },
  { slot: 3, prototype: '03', x: 8.8, z: -1.6, rotation: 180 },
];
