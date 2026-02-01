import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext.jsx';
import './TrapezoidChart.css';

function getThemeColor(varName) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName).trim();
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const team = payload[0].payload;
  return (
    <div className="trapezoid-tooltip">
      <div className="tooltip-team">{team.name}</div>
      <div className="tooltip-stat">Pace: {team.pace}</div>
      <div className="tooltip-stat">AdjNET: {team.adjusted_net_rating}</div>
      <div className="tooltip-stat">AdjO: {team.adjusted_offensive_rating} / AdjD: {team.adjusted_defensive_rating}</div>
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
          <clipPath id={`clip-${payload.team_id}`}>
            <circle cx={cx} cy={cy} r={size / 2} />
          </clipPath>
          <image
            href={payload.logo_url}
            x={cx - size / 2}
            y={cy - size / 2}
            width={size}
            height={size}
            clipPath={`url(#clip-${payload.team_id})`}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={size / 2} fill={getThemeColor('--color-border-primary')} />
      )}
    </g>
  );
}

function TrapezoidChart({ teams, onTeamClick }) {
  // Force re-render on theme change so colors update
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
      x: parseFloat(team.pace),
      y: parseFloat(team.adjusted_net_rating),
    }));
  }, [teams]);

  const { meanPace, meanAdjNET } = useMemo(() => {
    if (chartData.length === 0) return { meanPace: 0, meanAdjNET: 0 };
    const sumX = chartData.reduce((a, d) => a + d.x, 0);
    const sumY = chartData.reduce((a, d) => a + d.y, 0);
    return {
      meanPace: sumX / chartData.length,
      meanAdjNET: sumY / chartData.length,
    };
  }, [chartData]);

  // Compute axis domains with padding
  const { xDomain, yDomain } = useMemo(() => {
    if (chartData.length === 0) return { xDomain: [0, 100], yDomain: [-20, 40] };
    const xs = chartData.map(d => d.x);
    const ys = chartData.map(d => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xPad = (xMax - xMin) * 0.08;
    const yPad = (yMax - yMin) * 0.08;
    return {
      xDomain: [Math.floor(xMin - xPad), Math.ceil(xMax + xPad)],
      yDomain: [Math.floor(yMin - yPad), Math.ceil(yMax + yPad)],
    };
  }, [chartData]);

  // Trapezoid of Excellence: tight zone around elite teams
  // Shape: diagonal left edge from top-left down to bottom-middle, then horizontal to right
  // This shows that slow-paced teams need higher efficiency to be "elite"
  const trapezoidPoints = useMemo(() => {
    if (chartData.length === 0) return [];
    const xs = chartData.map(d => d.x);
    const ys = chartData.map(d => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMax = Math.max(...ys);

    // Top: just above the best team
    const yRange = yMax - Math.min(...ys);
    const topY = yMax + yRange * 0.05;
    
    // Bottom: around 60th percentile of AdjNET (captures top ~40% of teams)
    const sortedY = [...ys].sort((a, b) => a - b);
    const bottomY = sortedY[Math.floor(sortedY.length * 0.60)];

    // Left edge of chart
    const leftX = xMin - 1;
    // Right edge of chart  
    const rightX = xMax + 1;
    // Bottom-left point: where diagonal meets bottom (around mean pace)
    const bottomLeftX = meanPace - 2;

    // 4 points forming the trapezoid (clockwise from top-left):
    return [
      [leftX, topY],              // 1. top-left
      [rightX, topY],             // 2. top-right  
      [rightX, bottomY],          // 3. bottom-right
      [bottomLeftX, bottomY],     // 4. bottom-left (diagonal ends here)
    ];
  }, [chartData, meanPace]);

  // Read theme colors (re-reads when `colorVersion` changes after CSS update)
  const colors = useMemo(() => ({
    text: getThemeColor('--color-text-secondary'),
    grid: getThemeColor('--color-border-tertiary'),
    refLine: getThemeColor('--color-text-tertiary'),
  }), [colorVersion]);

  const renderShape = useCallback((props) => {
    return <LogoPoint {...props} onTeamClick={onTeamClick} />;
  }, [onTeamClick]);

  // Track container size for the SVG overlay
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Convert data coordinates to pixel coordinates for the SVG overlay
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const trapezoidPixels = useMemo(() => {
    if (trapezoidPoints.length === 0 || containerSize.width === 0) return '';
    const plotW = containerSize.width - margin.left - margin.right;
    const plotH = containerSize.height - margin.top - margin.bottom;
    if (plotW <= 0 || plotH <= 0) return '';

    const [xMin, xMax] = xDomain;
    const [yMin, yMax] = yDomain;

    return trapezoidPoints
      .map(([x, y]) => {
        const px = margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
        const py = margin.top + ((yMax - y) / (yMax - yMin)) * plotH;
        return `${px},${py}`;
      })
      .join(' ');
  }, [trapezoidPoints, containerSize, xDomain, yDomain]);

  if (chartData.length === 0) {
    return <div className="trapezoid-empty">No data available</div>;
  }

  return (
    <div className="trapezoid-chart-container" ref={containerRef} style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            type="number"
            dataKey="x"
            name="Pace"
            domain={xDomain}
            tick={{ fill: colors.text, fontSize: 12 }}
            label={{
              value: 'Pace',
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
            name="Adj. Net Rating"
            domain={yDomain}
            tick={{ fill: colors.text, fontSize: 12 }}
            label={{
              value: 'Adj. Net Rating',
              angle: -90,
              position: 'insideLeft',
              offset: -5,
              fill: colors.text,
              fontSize: 13,
              fontWeight: 600,
            }}
          />
          <ReferenceLine
            x={meanPace}
            stroke={colors.refLine}
            strokeDasharray="6 4"
            strokeWidth={1}
          />
          <ReferenceLine
            y={meanAdjNET}
            stroke={colors.refLine}
            strokeDasharray="6 4"
            strokeWidth={1}
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

export default TrapezoidChart;
