import './FilterBar.css';

function FilterBar({ conferences, months, filters, onFilterChange, onApply, onReset }) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Season</label>
        <select
          value={filters.season}
          onChange={(e) => onFilterChange('season', e.target.value)}
        >
          <option value="2025-26">2025-26</option>
        </select>
      </div>

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

      <div className="filter-group">
        <label>Stat Group</label>
        <select
          value={filters.statGroup}
          onChange={(e) => onFilterChange('statGroup', e.target.value)}
        >
          <option value="Overview">Overview</option>
          <option value="FourFactors">Advanced Analytics</option>
          <option value="Shooting">Shooting</option>
          <option value="Rebounding">Rebounding</option>
          <option value="Playmaking">Playmaking</option>
          <option value="Defense">Defense</option>
          <option value="Schedule">Schedule</option>
        </select>
      </div>

      <div className="filter-actions">
        <button className="apply-btn" onClick={onApply}>Apply Filters</button>
        <button className="reset-btn" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}

export default FilterBar;
