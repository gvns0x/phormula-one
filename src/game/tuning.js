const defaults = {
  steerMax: 0.35,
  steerRate: 4.4,
  brakeForce: 3,
  engineForce: 12000,
  acceleration: 1,
  maxSpeed: 372,
  linearDamping: 0.1,
  coastingDecay: 0.3,
  lateralGrip: 20,
  carSize: 2.7,
  carHeightOffset: 0.4,
};

export const tuning = { ...defaults };

export function resetTuning() {
  Object.assign(tuning, defaults);
}
