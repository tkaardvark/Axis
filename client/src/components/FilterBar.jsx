import './FilterBar.css';

function FilterBar({ conferences, months, filters, onFilterChange, onReset, view }) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Conference</label>
        <select
          value={filters.conference}
          onChange={(e) => onFilterChange('conference', e.target.value)}
        >
          <option value="All Conferences">All Conferences</option>
          {conferences.map((conf) => (
            <option key={conf} value={conf}>{conf}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label>Opponent</label>
        <select
          value={filters.opponent}
          onChange={(e) => onFilterChange('opponent', e.target.value)}
        >
          <option value="all">All NAIA Games</option>
          <option value="conference">Conference Games Only</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Season Segment</label>
        <select
          value={filters.seasonSegment}
          onChange={(e) => onFilterChange('seasonSegment', e.target.value)}
        >
          <option value="all">Entire Season</option>
          <option value="regular">Regular Season</option>
          <option value="postseason">All Postseason</option>
          <option value="conftournament">Conference Tournament</option>
          <option value="nationaltournament">National Tournament</option>
          <optgroup label="Last N Games">
            <option value="last10">Last 10 Games</option>
            <option value="last5">Last 5 Games</option>
            <option value="last3">Last 3 Games</option>
          </optgroup>
          {months.length > 0 && (
            <optgroup label="By Month">
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {view === 'visualizations' && (
        <div className="filter-group">
          <label>Teams Shown</label>
          <select
            value={filters.vizFilter || 'all'}
            onChange={(e) => onFilterChange('vizFilter', e.target.value)}
          >
            <option value="all">All Teams</option>
            <option value="net100">Top 100 — Adj. Net Rtg</option>
            <option value="net50">Top 50 — Adj. Net Rtg</option>
            <option value="rpi100">Top 100 — RPI</option>
            <option value="rpi50">Top 50 — RPI</option>
          </select>
        </div>
      )}

      <div className="filter-actions">
        <button className="reset-btn" onClick={onReset}>
          Reset Filters
        </button>
      </div>
    </div>
  );
}

export default FilterBar;
