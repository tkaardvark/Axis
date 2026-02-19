import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import './ScoreChart.css';

/**
 * Convert period + game_clock ("MM:SS") to elapsed minutes.
 * Each regulation period is 20 minutes (college basketball halves).
 * Overtime periods are 5 minutes each.
 */
function toElapsedMinutes(period, clock) {
  if (!clock) return (period - 1) * 20;
  const [min, sec] = clock.split(':').map(Number);
  const periodLength = period <= 2 ? 20 : 5;
  const elapsed = periodLength - min - sec / 60;
  if (period <= 2) {
    return (period - 1) * 20 + elapsed;
  }
  // Overtime: periods 3, 4, 5... map to OT1, OT2, OT3...
  return 40 + (period - 3) * 5 + elapsed;
}

function ScoreChart({ scoreProgression, awayName, homeName }) {
  const chartData = useMemo(() => {
    if (!scoreProgression || scoreProgression.length < 2) return [];

    return scoreProgression.map((p) => ({
      elapsed: Math.round(toElapsedMinutes(p.period, p.clock) * 100) / 100,
      away: p.awayScore,
      home: p.homeScore,
      period: p.period,
      clock: p.clock,
    }));
  }, [scoreProgression]);

  if (chartData.length < 2) return null;

  const maxPeriod = Math.max(...chartData.map((d) => d.period));
  const totalMinutes = maxPeriod <= 2 ? 40 : 40 + (maxPeriod - 2) * 5;
  const maxScore = Math.max(...chartData.map((d) => Math.max(d.away, d.home)));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const periodLabel =
        data.period <= 2
          ? `${data.period === 1 ? '1st' : '2nd'} Half`
          : `OT${data.period - 2}`;
      return (
        <div className="score-chart-tooltip">
          <p className="tooltip-time">
            {periodLabel} — {data.clock}
          </p>
          <p className="tooltip-away">
            <span className="tooltip-dot away-dot" />
            {awayName}: <strong>{data.away}</strong>
          </p>
          <p className="tooltip-home">
            <span className="tooltip-dot home-dot" />
            {homeName}: <strong>{data.home}</strong>
          </p>
        </div>
      );
    }
    return null;
  };

  const formatTick = (val) => {
    if (val === 0) return '0';
    if (val === 20) return 'Half';
    if (val === 40) return '40';
    if (val > 40 && val % 5 === 0) return `OT${(val - 40) / 5}`;
    return `${val}`;
  };

  // Build ticks: 0, 10, 20, 30, 40, then OT periods
  const ticks = [0, 10, 20, 30, 40];
  for (let p = 3; p <= maxPeriod; p++) {
    ticks.push(40 + (p - 2) * 5);
  }

  return (
    <div className="score-chart-container">
      <div className="score-chart-header">
        <h4>Score Progression</h4>
        <div className="score-chart-legend">
          <span className="legend-item">
            <span className="legend-line away-line" />
            {awayName}
          </span>
          <span className="legend-item">
            <span className="legend-line home-line" />
            {homeName}
          </span>
        </div>
      </div>
      <div className="score-chart-wrapper">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
          >
            <defs>
              <linearGradient id="awayGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-primary)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-accent-primary)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="homeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-line)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-chart-line)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border-tertiary)"
              vertical={false}
            />
            <XAxis
              dataKey="elapsed"
              type="number"
              domain={[0, totalMinutes]}
              ticks={ticks}
              tickFormatter={formatTick}
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-secondary)' }}
            />
            <YAxis
              domain={[0, Math.ceil(maxScore * 1.05)]}
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <ReferenceLine
              x={20}
              stroke="var(--color-text-tertiary)"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            {maxPeriod > 2 && (
              <ReferenceLine
                x={40}
                stroke="var(--color-text-tertiary)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="stepAfter"
              dataKey="away"
              stroke="var(--color-accent-primary)"
              strokeWidth={2}
              fill="url(#awayGradient)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--color-accent-primary)' }}
            />
            <Area
              type="stepAfter"
              dataKey="home"
              stroke="var(--color-chart-line)"
              strokeWidth={2}
              fill="url(#homeGradient)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--color-chart-line)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ScoreChart;
