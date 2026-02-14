/**
 * Determine quadrant for a game based on opponent RPI rank and game location
 * Quadrant thresholds from NAIA Selection Committee Policy:
 *
 * |Location| Q1     | Q2      | Q3       | Q4    |
 * |--------|--------|---------|----------|-------|
 * | Home   | 1-45   | 46-90   | 91-135   | 136+  |
 * | Neutral| 1-55   | 56-105  | 106-150  | 150+  |
 * | Away   | 1-65   | 66-120  | 121-165  | 166+  |
 */
function getQuadrant(oppRpiRank, location) {
  if (!oppRpiRank) return 4; // Unranked opponents are Q4

  if (location === 'home') {
    if (oppRpiRank <= 45) return 1;
    if (oppRpiRank <= 90) return 2;
    if (oppRpiRank <= 135) return 3;
    return 4;
  } else if (location === 'neutral') {
    if (oppRpiRank <= 55) return 1;
    if (oppRpiRank <= 105) return 2;
    if (oppRpiRank <= 150) return 3;
    return 4;
  } else { // away
    if (oppRpiRank <= 65) return 1;
    if (oppRpiRank <= 120) return 2;
    if (oppRpiRank <= 165) return 3;
    return 4;
  }
}

module.exports = { getQuadrant };
