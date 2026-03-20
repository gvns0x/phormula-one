export const coastalTrack = {
  id: 'coastal',
  name: 'Amalfi Coast',
  description: 'Scenic coastal circuit past Italian villages and the sea',
  themeColor: '#2277aa',
  icon: '\u{1F3D6}',

  centerline: [
    // Start on coastal road heading east
    [-160, 0],    [-110, -5],   [-60, -15],
    // Gentle right along the cliff edge
    [-10, -30],   [30, -55],    [55, -85],
    // Tight left hairpin at the lighthouse
    [65, -120],   [55, -150],   [30, -160],
    // Fast back straight along the sea (west)
    [-20, -155],  [-70, -140],  [-120, -120],
    // Sweeping right through village square
    [-155, -95],  [-175, -60],  [-180, -20],
    // Medium left through harbour
    [-175, 20],   [-155, 50],   [-125, 70],
    // Fast chicane along promenade
    [-85, 80],    [-45, 75],    [-5, 65],
    // Long right-hander uphill
    [35, 50],     [65, 30],     [80, 5],
    // Tight left through tunnel
    [75, -25],    [55, -45],
    // Short straight back to coastal road
    [20, -50],    [-20, -40],   [-60, -25],
    // Sweeping left returning to start
    [-110, -10],  [-145, 0],
  ],

  sectionWidths: {
    1: 12, 2: 11, 3: 10, 4: 10, 5: 9, 6: 10,
    7: 11, 8: 10, 9: 9, 10: 10, 11: 11, 12: 12,
  },

  sectionMap: [
    12, 12, 12,
    1, 1, 1,
    2, 2, 2,
    3, 3, 3,
    4, 4, 4,
    5, 5, 5,
    6, 6, 6,
    7, 7, 7,
    8, 8,
    9, 9, 9,
    10, 10,
  ],

  drsZone: { start: [-20, -155], end: [-155, -95] },

  theme: {
    environment: 'coastal',
    sky: 0x5eb8e8,
    fog: 0x8ec8e8,
    fogNear: 200,
    fogFar: 800,
    ground: 'coastal',
    ambientIntensity: 0.35,
    sunIntensity: 1.2,
    sunPosition: [150, 350, -100],
  },
};
