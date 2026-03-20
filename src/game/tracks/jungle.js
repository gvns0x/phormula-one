export const jungleTrack = {
  id: 'jungle',
  name: 'Amazon Jungle',
  description: 'Sweeping bends through dense tropical forest',
  themeColor: '#2d8a4e',
  icon: '\u{1F334}',

  centerline: [
    // Long flowing start straight heading south-east
    [0, -180],    [40, -175],   [90, -160],
    // Wide sweeping right through clearing
    [140, -130],  [175, -90],   [190, -40],
    // Gentle S-curves through dense canopy
    [185, 10],    [165, 55],    [130, 90],
    // Fast left kink
    [85, 115],    [40, 125],
    // Tight hairpin right around ancient ruins
    [0, 130],     [-30, 145],   [-40, 175],
    [-25, 205],   [10, 220],
    // Long sweeping right through river valley
    [60, 225],    [110, 215],   [155, 190],
    [180, 155],   [195, 115],
    // Chicane through bamboo grove
    [200, 75],    [210, 40],    [225, 10],
    // Fast left into back straight
    [230, -30],   [220, -70],   [195, -105],
    // Medium right
    [160, -135],  [120, -155],
    // Sweeping left back to start
    [75, -170],   [35, -180],
  ],

  sectionWidths: {
    1: 12, 2: 11, 3: 11, 4: 10, 5: 10, 6: 10,
    7: 9, 8: 9, 9: 11, 10: 10, 11: 10, 12: 12,
  },

  sectionMap: [
    12, 12, 12,
    1, 1, 1,
    2, 2, 2,
    3, 3,
    4, 4, 4, 4, 4,
    5, 5, 5, 5, 5,
    6, 6, 6,
    7, 7, 7,
    8, 8,
    9, 9,
  ],

  drsZone: { start: [60, 225], end: [195, 115] },

  theme: {
    environment: 'jungle',
    sky: 0x8fac8f,
    fog: 0x5a7a5a,
    fogNear: 100,
    fogFar: 500,
    ground: 'jungle',
    ambientIntensity: 0.35,
    sunIntensity: 0.8,
    sunPosition: [100, 250, -30],
  },
};
