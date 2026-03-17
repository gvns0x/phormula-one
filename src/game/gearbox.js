const GEAR_RATIOS = [
  166.667, // gear 1: 9000 / 54
  107.143, // gear 2: 9000 / 84
   78.947, // gear 3: 9000 / 114
   62.5,   // gear 4: 9000 / 144
   51.724, // gear 5: 9000 / 174
   45.455, // gear 6: 9000 / 198
   41.667, // gear 7: 9000 / 216
   39.931, // gear 8: 11500 / 288
];

export const MAX_RPM = 12000;
const DOWNSHIFT_RPM = 6500;
const NUM_GEARS = GEAR_RATIOS.length;

export function createGearbox() {
  let currentGear = 0; // 0-indexed internally, exposed as 1-indexed

  function update(speedKmh) {
    const spd = Math.abs(speedKmh);
    let rpm = spd * GEAR_RATIOS[currentGear];

    if (rpm >= MAX_RPM && currentGear < NUM_GEARS - 1) {
      currentGear++;
      rpm = spd * GEAR_RATIOS[currentGear];
    }

    while (currentGear > 0 && rpm < DOWNSHIFT_RPM) {
      currentGear--;
      rpm = spd * GEAR_RATIOS[currentGear];
    }

    rpm = Math.max(0, Math.min(rpm, MAX_RPM));

    return { gear: currentGear + 1, rpm: Math.round(rpm) };
  }

  function reset() {
    currentGear = 0;
  }

  return { update, reset };
}
