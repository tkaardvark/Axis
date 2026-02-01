import { useMemo } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

// Metrics configuration - what we show on the radar
// For defense metrics, "lower is better" so we invert the percentile
const RADAR_METRICS = [
  { key: 'efg_pct', label: 'eFG%', description: 'Effective FG%', higherIsBetter: true },
  { key: 'turnover_pct', label: 'TO%', description: 'Turnover Rate', higherIsBetter: false },
  { key: 'oreb_pct', label: 'OREB%', description: 'Off. Rebound Rate', higherIsBetter: true },
  { key: 'ft_rate', label: 'FT Rate', description: 'Free Throw Rate', higherIsBetter: true },
  { key: 'pace', label: 'Pace', description: 'Possessions/Game', higherIsBetter: null }, // neutral
  { key: 'three_pt_rate', label: '3PT Rate', description: '3PT Attempt Rate', higherIsBetter: null }, // style
];

// Calculate percentile rank (0-100) for a value within an array
function getPercentile(value, allValues, higherIsBetter = true) {
  if (value === null || value === undefined) return 50;
  const sorted = [...allValues].filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
  const rank = sorted.findIndex(v => v >= value);
  const percentile = (rank / sorted.length) * 100;
  return higherIsBetter ? percentile : 100 - percentile;
}

function TeamRadarChart({ team, allTeams }) {
  const chartData = useMemo(() => {
    if (!team || !allTeams || allTeams.length === 0) return [];

    return RADAR_METRICS.map(metric => {
      const teamValue = parseFloat(team[metric.key]);
      const allValues = allTeams.map(t => parseFloat(t[metric.key]));
      
      // For neutral metrics (pace, 3pt rate), show as percentile but don't color code
      const higherIsBetter = metric.higherIsBetter ?? true;
      const percentile = getPercentile(teamValue, allValues, higherIsBetter);
      
      // Format display value
      let displayValue;
      if (metric.key === 'pace') {
        displayValue = teamValue?.toFixed(1);
      } else {
        displayValue = (teamValue * 100)?.toFixed(1) + '%';
      }

      return {
        metric: metric.label,
        fullLabel: metric.description,
        value: Math.round(percentile),
        rawValue: displayValue,
        fullMark: 100,
      };
    });
  }, [team, allTeams]);

  if (!team || chartData.length === 0) {
    return null;
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="radar-tooltip">
          <p className="tooltip-label">{data.fullLabel}</p>
          <p className="tooltip-value">{data.rawValue}</p>
          <p className="tooltip-percentile">{data.value}th percentile</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="team-radar-container">
      <div className="radar-header">
        <h3>Team Profile</h3>
        <span className="radar-subtitle">Offensive metrics vs. league (percentile rank)</span>
      </div>
      <div className="radar-chart-wrapper">
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
            <PolarGrid 
              stroke="var(--color-border-secondary)" 
              strokeDasharray="3 3"
            />
            <PolarAngleAxis 
              dataKey="metric" 
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
              tickLine={false}
            />
            <PolarRadiusAxis 
              angle={90} 
              domain={[0, 100]} 
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }}
              tickCount={5}
              axisLine={false}
            />
            <Radar
              name="Team"
              dataKey="value"
              stroke="var(--color-chart-line)"
              fill="var(--color-chart-fill)"
              fillOpacity={1}
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--color-chart-dot)' }}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="radar-legend">
        <div className="radar-legend-item">
          <span className="legend-marker strong" />
          <span>75th+ percentile (strength)</span>
        </div>
        <div className="radar-legend-item">
          <span className="legend-marker average" />
          <span>25th-75th percentile (average)</span>
        </div>
        <div className="radar-legend-item">
          <span className="legend-marker weak" />
          <span>Below 25th percentile (weakness)</span>
        </div>
      </div>
    </div>
  );
}

export default TeamRadarChart;
