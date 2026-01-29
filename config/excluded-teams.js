/**
 * EXCLUDED TEAMS CONFIGURATION
 * 
 * Teams listed here will NOT be counted as NAIA opponents when calculating:
 * - NAIA record (naia_wins, naia_losses, naia_win_pct)
 * - Strength of Schedule (SOS, OSOS, DSOS, NSOS)
 * - RPI calculations
 * 
 * Each entry can specify:
 * - name: Team name (required) - matches partial names
 * - league: 'mens', 'womens', or 'both' (optional, defaults to 'both')
 * 
 * Common reasons to exclude:
 * - NCAA Division I, II, or III teams
 * - Junior colleges / community colleges
 * - International teams
 * - Club/exhibition opponents
 */

module.exports = {
  // Teams to exclude from NAIA calculations
  // Format: { name: 'Team Name', league: 'mens' | 'womens' | 'both' }
  excludedTeams: [
    // === NCAA DIVISION II ===
    { name: 'UHSP', league: 'mens' },  // University of Health Sciences and Pharmacy - NCAA D2
    { name: 'Paul Quinn', league: 'mens' },  // Paul Quinn College - NCAA D2
    { name: 'Middle Georgia State', league: 'mens' },  // Middle Georgia State - NCAA D2
    
    // === NCAA DIVISION I ===
    // { name: 'Example University', league: 'both' },
    
    // === NCAA DIVISION III ===
    // { name: 'Example College', league: 'mens' },
    
    // === JUNIOR COLLEGES ===
    // { name: 'Example CC', league: 'both' },
    
    // === OTHER NON-NAIA ===
    // { name: 'International Team', league: 'womens' },
  ],

  // Helper function to check if a team should be excluded
  isExcluded(teamNameOrId, league = null) {
    if (!teamNameOrId) return false;
    const normalized = teamNameOrId.toLowerCase().trim();
    
    return this.excludedTeams.some(excluded => {
      const excludedName = (typeof excluded === 'string' ? excluded : excluded.name).toLowerCase().trim();
      const excludedLeague = typeof excluded === 'string' ? 'both' : (excluded.league || 'both');
      
      const nameMatches = normalized.includes(excludedName) || excludedName.includes(normalized);
      const leagueMatches = !league || excludedLeague === 'both' || excludedLeague === league;
      
      return nameMatches && leagueMatches;
    });
  },

  // Get all excluded entries for a specific league
  getExcludedForLeague(league) {
    return this.excludedTeams.filter(excluded => {
      const excludedLeague = typeof excluded === 'string' ? 'both' : (excluded.league || 'both');
      return excludedLeague === 'both' || excludedLeague === league;
    });
  }
};
