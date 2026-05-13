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
 * Men's basketball: 2 halves of 20 minutes each (regulation = 40 min).
 * Women's basketball: 4 quarters of 10 minutes each (regulation = 40 min).
 * Overtime periods are 5 minutes each.
 */
function toElapsedMinutes(period, clock, league) {
  const isWomens = league === 'womens';
  const regPeriods = isWomens ? 4 : 2;
  const regPeriodLen = isWomens ? 10 : 20;
  const regulationMin = regPeriods * regPeriodLen; // always 40

  if (!clock) {
    if (period <= regPeriods) return (period - 1) * regPeriodLen;
    return regulationMin + (period - regPeriods - 1) * 5;
  }
  const [min, sec] = clock.split(':').map(Number);
  const periodLength = period <= regPeriods ? regPeriodLen : 5;
  const elapsed = periodLength - min - sec / 60;
  if (period <= regPeriods) {
    return (period - 1) * regPeriodLen + elapsed;
  }
  return regulationMin + (period - regPeriods - 1) * 5 + elapsed;
}

function ScoreChart({ scoreProgression, awayName, homeName, league }) {
  const isWomens = league === 'womens';
  const regPeriods = isWomens ? 4 : 2;
  const regPeriodLen = isWomens ? 10 : 20;
  const regulationMin = regPeriods * regPeriodLen; // 40

  const chartData = useMemo(() => {
    if (!scoreProgression || scoreProgression.length < 2) return [];

    return scoreProgression.map((p) => ({
      elapsed: Math.round(toElapsedMinutes(p.period, p.clock, league) * 100) / 100,
      away: p.awayScore,
      home: p.homeScore,
      period: p.period,
      clock: p.clock,
    }));
  }, [scoreProgression, league]);

  if (chartData.length < 2) return null;

  const maxPeriod = Math.max(...chartData.map((d) => d.period));
  const totalMinutes = maxPeriod <= regPeriods
    ? regulationMin
    : regulationMin + (maxPeriod - regPeriods) * 5;
  const maxScore = Math.max(...chartData.map((d) => Math.max(d.away, d.home)));

  const periodOrdinal = (n) => {
    if (isWomens) return `Q${n}`;
    return n === 1 ? '1st Half' : '2nd Half';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const periodLabel =
        data.period <= regPeriods
          ? periodOrdinal(data.period)
          : `OT${data.period - regPeriods}`;
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
    if (isWomens) {
      // Mark each quarter boundary
      if (val === 10) return 'Q1';
      if (val === 20) return 'Half';
      if (val === 30) return 'Q3';
      if (val === 40) return '40';
    } else {
      if (val === 20) return 'Half';
      if (val === 40) return '40';
    }
    if (val > 40 && val % 5 === 0) return `OT${(val - 40) / 5}`;
    return `${val}`;
  };

  // Build ticks: regulation markers + each OT
  const ticks = isWomens ? [0, 10, 20, 30, 40] : [0, 10, 20, 30, 40];
  for (let p = regPeriods + 1; p <= maxPeriod; p++) {
    ticks.push(regulationMin + (p - regPeriods) * 5);
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
            {maxPeriod > regPeriods && (
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
