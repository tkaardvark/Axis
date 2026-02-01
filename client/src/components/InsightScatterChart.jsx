import { useMemo, useEffect, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext.jsx';
import './InsightScatterChart.css';

function getThemeColor(varName) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName).trim();
}

function ChartTooltip({ active, payload, config }) {
  if (!active || !payload || payload.length === 0) return null;
  const team = payload[0].payload;
  return (
    <div className="insight-scatter-tooltip">
      <div className="tooltip-team">{team.name}</div>
      <div className="tooltip-stat">{config.xLabel}: {config.xFormat ? config.xFormat(team.x) : team.x.toFixed(1)}</div>
      <div className="tooltip-stat">{config.yLabel}: {config.yFormat ? config.yFormat(team.y) : team.y.toFixed(1)}</div>
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
          <clipPath id={`clip-scatter-${payload.team_id}`}>
            <circle cx={cx} cy={cy} r={size / 2} />
          </clipPath>
          <image
            href={payload.logo_url}
            x={cx - size / 2}
            y={cy - size / 2}
            width={size}
            height={size}
            clipPath={`url(#clip-scatter-${payload.team_id})`}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={size / 2} fill={getThemeColor('--color-border-primary')} />
      )}
    </g>
  );
}

/**
 * Generic scatter chart for insights visualizations
 * @param {Object} props
 * @param {Array} props.teams - Array of team objects
 * @param {string} props.xKey - Key for X axis value
 * @param {string} props.yKey - Key for Y axis value
 * @param {string} props.xLabel - Label for X axis
 * @param {string} props.yLabel - Label for Y axis
 * @param {function} props.xFormat - Optional formatter for X values
 * @param {function} props.yFormat - Optional formatter for Y values
 * @param {boolean} props.showMeanLines - Whether to show mean reference lines
 * @param {function} props.onTeamClick - Callback when team is clicked
 */
function InsightScatterChart({ 
  teams, 
  xKey, 
  yKey, 
  xLabel, 
  yLabel, 
  xFormat,
  yFormat,
  showMeanLines = true,
  onTeamClick 
}) {
  const { theme } = useTheme();
  const [colorVersion, setColorVersion] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setColorVersion(v => v + 1);
    }, 50);
    return () => clearTimeout(timer);
  }, [theme]);

  const chartData = useMemo(() => {
    return teams
      .filter(team => team[xKey] != null && team[yKey] != null)
      .map(team => ({
        ...team,
        x: parseFloat(team[xKey]),
        y: parseFloat(team[yKey]),
      }));
  }, [teams, xKey, yKey]);

  const { meanX, meanY } = useMemo(() => {
    if (chartData.length === 0) return { meanX: 0, meanY: 0 };
    const sumX = chartData.reduce((a, d) => a + d.x, 0);
    const sumY = chartData.reduce((a, d) => a + d.y, 0);
    return {
      meanX: sumX / chartData.length,
      meanY: sumY / chartData.length,
    };
  }, [chartData]);

  const { xDomain, yDomain } = useMemo(() => {
    if (chartData.length === 0) return { xDomain: [0, 100], yDomain: [0, 100] };
    const xs = chartData.map(d => d.x);
    const ys = chartData.map(d => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xPadding = (xMax - xMin) * 0.08;
    const yPadding = (yMax - yMin) * 0.08;
    return {
      xDomain: [xMin - xPadding, xMax + xPadding],
      yDomain: [yMin - yPadding, yMax + yPadding],
    };
  }, [chartData]);

  const gridColor = getThemeColor('--color-border-secondary');
  const axisColor = getThemeColor('--color-text-tertiary');
  const refLineColor = getThemeColor('--color-text-tertiary');

  const config = { xLabel, yLabel, xFormat, yFormat };

  if (chartData.length === 0) {
    return <div className="insight-scatter-empty">No data available</div>;
  }

  return (
    <div className="insight-scatter-container">
      <ResponsiveContainer width="100%" height={500}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 60 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            domain={xDomain}
            tick={{ fill: axisColor, fontSize: 12 }}
            tickLine={{ stroke: axisColor }}
            axisLine={{ stroke: axisColor }}
            label={{
              value: xLabel,
              position: 'bottom',
              offset: 35,
              fill: axisColor,
              fontSize: 13,
            }}
            tickFormatter={xFormat || (v => v.toFixed(1))}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            domain={yDomain}
            tick={{ fill: axisColor, fontSize: 12 }}
            tickLine={{ stroke: axisColor }}
            axisLine={{ stroke: axisColor }}
            label={{
              value: yLabel,
              angle: -90,
              position: 'insideLeft',
              offset: -45,
              fill: axisColor,
              fontSize: 13,
              style: { textAnchor: 'middle' },
            }}
            tickFormatter={yFormat || (v => v.toFixed(1))}
          />
          <Tooltip content={<ChartTooltip config={config} />} />
          {showMeanLines && (
            <>
              <ReferenceLine x={meanX} stroke={refLineColor} strokeDasharray="5 5" strokeWidth={1} />
              <ReferenceLine y={meanY} stroke={refLineColor} strokeDasharray="5 5" strokeWidth={1} />
            </>
          )}
          <Scatter
            data={chartData}
            shape={(props) => <LogoPoint {...props} onTeamClick={onTeamClick} />}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export default InsightScatterChart;
