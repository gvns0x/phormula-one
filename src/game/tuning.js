const defaults = {
  steerMax: 0.35,
  steerRate: 4,
  brakeForce: 80,
  engineForce: 12000,
  maxSpeed: 85,
  linearDamping: 0.1,
  coastingDecay: 0.3,
  lateralGrip: 8,
};

export const tuning = { ...defaults };

export function resetTuning() {
  Object.assign(tuning, defaults);
}
