function MatchupComparisonBar({ label, team1Value, team2Value, format, higherIsBetter = true, tooltip }) {
  const formatValue = (val) => {
    if (val === null || val === undefined) return '-';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    switch (format) {
      case 'pct1': return (num * 100).toFixed(1) + '%';
      case 'pct3': return (num * 100).toFixed(1) + '%';
      case 'rating': return num.toFixed(1);
      case 'rating2': return num.toFixed(2);
      case 'int': return Math.round(num).toString();
      default: return num.toFixed(1);
    }
  };

  const formatDiff = (diff) => {
    switch (format) {
      case 'pct1':
      case 'pct3': return (diff * 100).toFixed(1) + '%';
      case 'rating': return diff.toFixed(1);
      case 'rating2': return diff.toFixed(2);
      case 'int': return Math.round(diff).toString();
      default: return diff.toFixed(1);
    }
  };

  const v1 = parseFloat(team1Value);
  const v2 = parseFloat(team2Value);
  const bothValid = !isNaN(v1) && !isNaN(v2);

  // Calculate bar widths (0-100% of half width)
  let bar1Width = 50;
  let bar2Width = 50;
  let team1Advantage = false;
  let team2Advantage = false;

  if (bothValid && v1 !== v2) {
    const max = Math.max(Math.abs(v1), Math.abs(v2));
    if (max > 0) {
      bar1Width = Math.max(8, Math.min(95, (Math.abs(v1) / max) * 95));
      bar2Width = Math.max(8, Math.min(95, (Math.abs(v2) / max) * 95));
    }

    if (higherIsBetter === true) {
      team1Advantage = v1 > v2;
      team2Advantage = v2 > v1;
    } else if (higherIsBetter === false) {
      team1Advantage = v1 < v2;
      team2Advantage = v2 < v1;
    }
  }

  // Calculate the difference for display
  let diffLabel = null;
  if (bothValid) {
    const diff = Math.abs(v1 - v2);
    diffLabel = diff === 0 ? 'Even' : `Δ ${formatDiff(diff)}`;
  }

  return (
    <div className="comparison-row" title={tooltip}>
      <div className="comparison-value comparison-value-left">
        <span className={team1Advantage ? 'value-advantage' : ''}>{formatValue(team1Value)}</span>
      </div>
      <div className="comparison-bar-container">
        <div className="comparison-bar-left">
          <div
            className={`comparison-bar-fill ${team1Advantage ? 'bar-advantage' : 'bar-neutral'}`}
            style={{ width: `${bar1Width}%` }}
          />
        </div>
        <div className="comparison-bar-right">
          <div
            className={`comparison-bar-fill ${team2Advantage ? 'bar-advantage' : 'bar-neutral'}`}
            style={{ width: `${bar2Width}%` }}
          />
        </div>
      </div>
      <div className="comparison-value comparison-value-right">
        <span className={team2Advantage ? 'value-advantage' : ''}>{formatValue(team2Value)}</span>
      </div>
      <div className="comparison-label">
        {label}
        {diffLabel && <span className="comparison-diff">{diffLabel}</span>}
      </div>
    </div>
  );
}

export default MatchupComparisonBar;
