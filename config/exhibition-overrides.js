/**
 * EXHIBITION GAME OVERRIDES
 * 
 * Games listed here will be forced to is_exhibition = true during import,
 * even if the source data does not mark them as exhibition.
 * 
 * Each entry should include:
 * - gameId: The game_id from the database (format: teamId_eventId)
 * - description: Human-readable note explaining why this override exists
 * 
 * These overrides are applied after game parsing in import-data.js,
 * so they persist across re-imports.
 */

module.exports = {
  exhibitionOverrides: [
    {
      gameId: 'g8zy9rkqpps1iz5b_x7ba7pgj108l9k4f',
      description: 'Bellevue (NE) vs Augustana University, Nov 30 2025 — confirmed exhibition',
    },
  ],
};
