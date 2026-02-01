import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext.jsx';
import './ChampionshipDNA.css';

function getThemeColor(varName) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName).trim();
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const team = payload[0].payload;
  return (
    <div className="dna-tooltip">
      <div className="tooltip-team">{team.name}</div>
      <div className="tooltip-stat">AdjO: {team.adjusted_offensive_rating}</div>
      <div className="tooltip-stat">AdjD: {team.adjusted_defensive_rating}</div>
      <div className="tooltip-stat">AdjNET: {team.adjusted_net_rating}</div>
    </div>
  );
}

function LogoPoint(props) {
  const { cx, cy, payload, onTeamClick } = props;
  const size = 28;

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        if (onTeamClick) onTeamClick(payload);
      }}
    >
      {payload.logo_url ? (
        <>
          <clipPath id={`dna-clip-${payload.team_id}`}>
            <circle cx={cx} cy={cy} r={size / 2} />
          </clipPath>
          <image
            href={payload.logo_url}
            x={cx - size / 2}
            y={cy - size / 2}
            width={size}
            height={size}
            clipPath={`url(#dna-clip-${payload.team_id})`}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={size / 2} fill={getThemeColor('--color-border-primary')} />
      )}
    </g>
  );
}

function ChampionshipDNA({ teams, onTeamClick }) {
  const { theme } = useTheme();
  
  // Track when colors should be re-read (after CSS variables have updated)
  const [colorVersion, setColorVersion] = useState(0);
  
  // Delay color reading to ensure CSS variables have propagated
  useEffect(() => {
    const timer = setTimeout(() => {
      setColorVersion(v => v + 1);
    }, 50);
    return () => clearTimeout(timer);
  }, [theme]);

  const chartData = useMemo(() => {
    return teams.map(team => ({
      ...team,
      x: parseFloat(team.adjusted_defensive_rating),
      y: parseFloat(team.adjusted_offensive_rating),
    }));
  }, [teams]);

  // Compute axis domains with padding
  const { xDomain, yDomain } = useMemo(() => {
    if (chartData.length === 0) return { xDomain: [80, 110], yDomain: [80, 110] };
    const xs = chartData.map(d => d.x);
    const ys = chartData.map(d => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xPad = (xMax - xMin) * 0.12;
    const yPad = (yMax - yMin) * 0.12;
    return {
      xDomain: [Math.floor(xMin - xPad), Math.ceil(xMax + xPad)],
      yDomain: [Math.floor(yMin - yPad), Math.ceil(yMax + yPad)],
    };
  }, [chartData]);

  const colors = useMemo(() => ({
    text: getThemeColor('--color-text-secondary'),
    grid: getThemeColor('--color-border-tertiary'),
    refLine: getThemeColor('--color-text-tertiary'),
  }), [colorVersion]);

  const renderShape = useCallback((props) => {
    return <LogoPoint {...props} onTeamClick={onTeamClick} />;
  }, [onTeamClick]);

  if (chartData.length === 0) {
    return <div className="dna-empty">No data available</div>;
  }

  return (
    <div className="dna-chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            type="number"
            dataKey="x"
            name="Adj. DRTG"
            domain={xDomain}
            reversed
            tick={{ fill: colors.text, fontSize: 12 }}
            label={{
              value: 'Adj. Defensive Rating (lower is better \u2192)',
              position: 'bottom',
              offset: 20,
              fill: colors.text,
              fontSize: 13,
              fontWeight: 600,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Adj. ORTG"
            domain={yDomain}
            tick={{ fill: colors.text, fontSize: 12 }}
            label={{
              value: 'Adj. Offensive Rating',
              angle: -90,
              position: 'insideLeft',
              offset: -5,
              fill: colors.text,
              fontSize: 13,
              fontWeight: 600,
            }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={false}
          />
          <Scatter
            data={chartData}
            shape={renderShape}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ChampionshipDNA;
