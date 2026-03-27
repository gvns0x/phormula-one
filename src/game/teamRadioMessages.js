export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const FIRST_LAP_CLEAN = 'Good first lap, keep it clean';
export const FIRST_LAP_DIRTY = "Let's try to make it clean in the next lap";

export const NEW_FASTEST_LAP = [
  'Fastest lap, try to beat the ghost car now',
  'Fastest lap. Keep pushing.',
  'Best lap so far. Keep the speed.',
  'Fastest lap. Beat the purple ghost car.',
  'Fastest one so far. Beat it by beating the purple ghost car.',
];

export const LAST_LAP = [
  'Last lap. Last lap. Push.',
  'Push everything. Last lap.',
  'Make it count. Stay in the track.',
  "Let's go. Last lap. Beat the purple ghost car.",
];

export const DAMAGE_ORANGE = [
  'Got some damage. Still good to go.',
  'You OK? Car got some damage.',
  'Careful. Keep within the white lines.',
];

export const DAMAGE_RED = [
  'Car is at the limit. No more hits.',
  "Careful. Don't risk it.",
  'How does the car feel? Got some damage.',
];
