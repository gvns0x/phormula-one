export const jungleTrack = {
  id: 'jungle',
  name: 'Amazon Jungle',
  description: 'Sweeping bends through dense tropical forest',
  themeColor: '#2d8a4e',
  icon: '\u{1F334}',

  centerline: [
    // Start/Finish (bottom right), heading left
    [365, 190],
    // Bottom straight heading left (sector 01)
    [280, 190],   [170, 190],   [60, 190],
    // Turn 1: left-hander going up (sector 02)
    [0, 185],     [-40, 168],   [-60, 148],
    // Senna S going up left side (sectors 02-03)
    [-75, 118],   [-65, 88],    [-80, 60],
    // Far left hairpin (sector 03)
    [-88, 35],    [-82, 10],    [-65, -5],
    // Right across the top to sector 04
    [-30, -12],   [15, -18],    [55, -20],
    // Switchback left and down (sector 05)
    [30, -8],     [-5, 18],     [-30, 40],
    // Down through sectors 06-07
    [-5, 68],     [28, 95],     [60, 125],
    [80, 140],
    // Sector 08: back up
    [85, 110],    [90, 72],
    // Sector 09: diagonal straight NE (Reta Oposta)
    [120, 40],    [170, 12],    [230, -18],   [280, -35],
    // Enter right side (sector 10)
    [318, -36],
    // Right sweeper south to sector 10 apex
    [355, -18],   [385, 5],     [395, 35],    [388, 60],
    // Left curve back north through sectors 11-12
    [368, 35],    [348, 5],     [332, -28],
    // To sector 13 (far right)
    [342, -56],   [390, -60],   [428, -52],
    // Sector 14: curving south
    [442, -28],   [445, 8],     [442, 52],
    [436, 102],   [428, 142],
    // Return to bottom straight
    [415, 170],   [398, 188],
  ],

  sectionWidths: {
    1: 13, 2: 11, 3: 10, 4: 10, 5: 9, 6: 9, 7: 9,
    8: 10, 9: 12, 10: 11, 11: 10, 12: 10, 13: 10, 14: 11,
  },

  sectionMap: [
    1,
    1, 1, 1,
    2, 2, 2,
    3, 3, 3,
    3, 4, 4,
    4, 4, 4,
    5, 5, 5,
    6, 6, 7,
    7,
    8, 8,
    9, 9, 9, 9,
    10, 10,
    10, 10, 10,
    11, 11, 12,
    12, 13, 13,
    14, 14, 14, 14, 14,
    1, 1,
  ],

  drsZone: { start: [280, 190], end: [60, 190] },

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
