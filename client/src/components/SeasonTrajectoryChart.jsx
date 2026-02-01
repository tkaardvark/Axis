import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Estimate possessions for a game (simplified formula)
function estimatePossessions(teamScore, oppScore) {
  const totalPoints = teamScore + oppScore;
  return Math.round(totalPoints / 2);
}

function SeasonTrajectoryChart({ schedule, teamName }) {
  const chartData = useMemo(() => {
    if (!schedule || schedule.length === 0) return [];

    // Filter to completed games and sort by date
    const completedGames = schedule
      .filter(g => g.is_completed && g.team_score && g.opponent_score)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (completedGames.length === 0) return [];

    // Calculate cumulative stats
    let totalPoints = 0;
    let totalPointsAllowed = 0;
    let totalPoss = 0;
    let wins = 0;
    let losses = 0;

    return completedGames.map((game, index) => {
      const poss = estimatePossessions(game.team_score, game.opponent_score);
      totalPoints += game.team_score;
      totalPointsAllowed += game.opponent_score;
      totalPoss += poss;
      
      if (game.result === 'W') wins++;
      else losses++;

      // Calculate cumulative net rating (per 100 possessions)
      const ortg = (totalPoints / totalPoss) * 100;
      const drtg = (totalPointsAllowed / totalPoss) * 100;
      const netRating = ortg - drtg;

      // Format date for display
      const gameDate = new Date(game.date);
      const dateLabel = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      return {
        gameNum: index + 1,
        date: dateLabel,
        opponent: game.opponent_name,
        netRating: Math.round(netRating * 10) / 10,
        ortg: Math.round(ortg * 10) / 10,
        drtg: Math.round(drtg * 10) / 10,
        result: game.result,
        score: `${game.team_score}-${game.opponent_score}`,
        record: `${wins}-${losses}`,
        margin: game.team_score - game.opponent_score,
      };
    });
  }, [schedule]);

  if (chartData.length < 2) {
    return (
      <div className="trajectory-container">
        <div className="trajectory-header">
          <h3>Season Trajectory</h3>
          <span className="trajectory-subtitle">Not enough games to show trajectory</span>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="trajectory-tooltip">
          <p className="tooltip-header">Game {data.gameNum}: {data.date}</p>
          <p className="tooltip-opponent">vs {data.opponent}</p>
          <p className={`tooltip-result ${data.result === 'W' ? 'win' : 'loss'}`}>
            {data.result} {data.score} ({data.margin > 0 ? '+' : ''}{data.margin})
          </p>
          <p className="tooltip-margin">
            Season Net Rating: <strong>{data.netRating > 0 ? '+' : ''}{data.netRating}</strong>
          </p>
          <p className="tooltip-record">Record: {data.record}</p>
        </div>
      );
    }
    return null;
  };

  // Calculate unified Y domain that works for both margin and net rating
  const margins = chartData.map(d => d.margin);
  const ratings = chartData.map(d => d.netRating);
  const allValues = [...margins, ...ratings];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = Math.max(5, (maxVal - minVal) * 0.15);
  const yDomain = [
    Math.floor(minVal - padding),
    Math.ceil(maxVal + padding)
  ];

  // Determine trend (compare last 3 games cumulative net rating to first 3)
  const recentAvg = chartData.slice(-3).reduce((s, d) => s + d.netRating, 0) / 3;
  const earlyAvg = chartData.slice(0, 3).reduce((s, d) => s + d.netRating, 0) / 3;
  const trend = recentAvg > earlyAvg + 2 ? 'improving' : recentAvg < earlyAvg - 2 ? 'declining' : 'steady';
  const trendLabel = trend === 'improving' ? '↑ Improving' : trend === 'declining' ? '↓ Declining' : '→ Steady';

  return (
    <div className="trajectory-container">
      <div className="trajectory-header">
        <h3>Season Trajectory</h3>
        <span className={`trajectory-trend ${trend}`}>{trendLabel}</span>
      </div>
      <div className="trajectory-chart-wrapper">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 25, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" />
            <XAxis 
              dataKey="gameNum" 
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-primary)' }}
              label={{ value: 'Game #', position: 'insideBottom', offset: -15, fill: 'var(--color-text-tertiary)', fontSize: 11 }}
            />
            <YAxis 
              domain={yDomain}
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-primary)' }}
              tickFormatter={(v) => v > 0 ? `+${v}` : v}
            />
            <ReferenceLine y={0} stroke="var(--color-text-tertiary)" strokeDasharray="5 5" />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Bars for individual game margins */}
            <Bar dataKey="margin" radius={[3, 3, 0, 0]} opacity={0.8}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.margin > 0 ? '#22c55e' : '#ef4444'}
                />
              ))}
            </Bar>
            
            {/* Line for cumulative net rating trend */}
            <Line
              type="monotone"
              dataKey="netRating"
              stroke="var(--color-chart-line)"
              strokeWidth={3}
              dot={{ r: 5, fill: 'var(--color-chart-dot)', strokeWidth: 2, stroke: 'var(--color-bg-primary)' }}
              activeDot={{ r: 7, fill: 'var(--color-chart-dot)', stroke: 'var(--color-bg-primary)', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="trajectory-footer">
        <div className="trajectory-legend">
          <span className="legend-item"><span className="legend-dot win"></span> Win margin</span>
          <span className="legend-item"><span className="legend-dot loss"></span> Loss margin</span>
          <span className="legend-item"><span className="legend-line"></span> Season Net Rtg</span>
        </div>
      </div>
    </div>
  );
}

export default SeasonTrajectoryChart;
