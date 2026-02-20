# Axis Analytics — Stakeholder Overview

A non-technical guide to understanding how the website works, where data comes from, and what the numbers mean.

---

## What Is Axis Analytics?

Axis Analytics is a website that provides advanced basketball statistics and analytics for all NAIA (National Association of Intercollegiate Athletics) basketball teams. It goes beyond basic box scores to calculate metrics that help coaches, selection committee members, and fans understand team performance at a deeper level.

The site covers both **Men's** and **Women's** basketball and supports multiple seasons.

---

## The Five Pages

### 1. Teams (Home Page)
The main page with a sortable table of every NAIA team. Statistics are grouped into tabs:
- **Efficiency** — Adjusted ratings that account for strength of opponents
- **Offense** — Shooting percentages, points per game, scoring breakdowns
- **Defense** — Points allowed, opponent shooting, defensive rebounding
- **Experimental** — Quality Win Index and Power Index (composite metrics)

You can filter by conference, opponent type (conference games only, NAIA games, etc.), and time period (specific months or last 5/10 games).

There's also a **Charts** toggle that shows the same data as interactive charts instead of a table.

### 2. Players
Individual player statistics for the current season. Sortable by points, rebounds, assists, shooting percentages, and more. You can filter by conference, team, position, and class year.

### 3. Conferences
Conference-level analysis including:
- Conference power rankings (which conferences are strongest overall)
- Conference standings with projected final records
- Head-to-head results within each conference
- Daily game schedules

### 4. Bracketcast
A projection of the NAIA National Tournament bracket. Shows:
- Team rankings based on selection criteria (RPI, win percentage, quadrant records)
- Projected seeding and first-round matchups
- Geographic pod assignments
- Conference champion automatic qualifiers

### 5. Scout
A team comparison and scouting tool. Select a team to see:
- Detailed stat profile with a radar chart
- Season trajectory (how performance has changed over time)
- Full roster with player stats
- Complete schedule with results and predictions for upcoming games

Select two teams to see a side-by-side matchup comparison.

---

## How Data Stays Fresh

The system automatically pulls updated game results from the official NAIA statistics provider (Presto Sports) multiple times per day:

- **Every 4 hours** — New game results are imported and all statistics are recalculated
- **Midnight** — Team rosters and conference assignments are refreshed
- **3:00 AM** — Individual player statistics are updated

Game results typically appear on the site within **4-8 hours** of a game ending, depending on when the school reports results to Presto Sports.

---

## Where Does the Data Come From?

### What we collect from Presto Sports:
- Game scores and box scores (field goals, rebounds, assists, etc.)
- Team schedules and results
- Conference membership
- Individual player statistics
- Team logos and school colors

### What we calculate ourselves:
All advanced metrics are calculated by Axis Analytics. These are not available from the NAIA or Presto Sports:
- Efficiency ratings (offensive, defensive, net)
- Adjusted ratings (accounting for strength of opponents)
- Rating Percentage Index (RPI)
- Strength of Schedule
- Quadrant records
- Tournament bracket projections
- Quality Win Index and Power Index

### Known Limitations
- Data quality depends on schools accurately reporting results to Presto Sports
- Games against non-NAIA opponents (NCAA D1/D2/D3, junior colleges) are tracked but excluded from NAIA-specific calculations
- The RPI formula and quadrant thresholds are based on publicly available NAIA selection criteria and may not exactly match the official committee's methodology

---

## What Do the Metrics Mean?

### Core Ratings

**Adjusted Net Rating (Adj NET)** — The single best measure of team quality. It represents the point differential per 100 possessions, adjusted for the strength of opponents faced. A team with Adj NET of +15 is roughly 15 points per 100 possessions better than average. Positive is good; the higher the better.

**Offensive Rating (ORTG)** — Points scored per 100 possessions. Using possessions instead of games removes the effect of pace: a slow team scoring 60 points could be just as efficient as a fast team scoring 80. Higher is better.

**Defensive Rating (DRTG)** — Points allowed per 100 possessions. Lower is better (you want to allow fewer points).

**Net Rating** — Offensive Rating minus Defensive Rating. Same as Adj NET but without the opponent-strength adjustment.

### Selection Criteria

**RPI (Rating Percentage Index)** — The NAIA's primary ranking formula: 30% own win percentage + 50% opponents' win percentage + 20% opponents' opponents' win percentage. Only NAIA games count. Lower RPI rank = better.

**Quadrant Records (Q1/Q2/Q3/Q4)** — Games are divided into quality tiers based on the opponent's RPI rank and game location:
- **Q1:** Best opponents (Home vs. RPI 1-45, Neutral vs. 1-55, Away vs. 1-65)
- **Q2:** Good opponents (Home 46-90, Neutral 56-105, Away 66-120)
- **Q3:** Average opponents (Home 91-135, Neutral 106-150, Away 121-165)
- **Q4:** Weakest opponents (everyone else)

Q1 wins are the most valuable. Q4 losses are the most damaging.

**Primary Criteria Ranking (PCR)** — A composite rank combining Overall Win %, RPI, and Quadrant Win Points. Used for our tournament seeding simulation.

**Projected Rank (PR)** — The PCR with conference tournament champions guaranteed a spot in the top 64 (automatic qualifiers).

### Efficiency Metrics (Four Factors)

**Effective FG% (eFG%)** — Field goal percentage adjusted for 3-pointers being worth more: (FGM + 0.5 x 3PM) / FGA. More accurate than raw FG%.

**Turnover %** — Turnovers per 100 possessions. Lower is better for your team; higher is better when measuring what you force opponents into.

**Offensive Rebound % (OREB%)** — Percentage of available offensive rebounds your team grabs. Second chances are valuable.

**Free Throw Rate** — Free throw attempts divided by field goal attempts. Measures the ability to get to the free throw line.

### Strength of Schedule

**Strength of Schedule (SOS)** — Average quality of opponents faced. Higher means a tougher schedule.

**OSOS / DSOS / NSOS** — Offensive, Defensive, and Net Strength of Schedule. Break down whether a team's schedule was tough offensively, defensively, or both.

**Opponent Win %** — Average win percentage of all opponents faced.

### Experimental Metrics

**Quality Win Index (QWI)** — Weighted sum of quadrant wins minus quadrant losses. Rewards Q1 wins heavily and penalizes Q4 losses heavily.

**Power Index** — Composite metric: 35% Adj ORTG + 35% Inverted Adj DRTG + 15% SOS + 7.5% Win% + 7.5% QWI.

### Other Terms

**Pace** — Possessions per game. Fast-paced teams have higher pace values. This affects raw point totals but not efficiency ratings.

---

## How to Request Changes

### Bug Reports
Include:
- Which page the issue is on
- What team/player/conference is affected
- What you expected to see vs. what you actually see
- A screenshot if possible

### Feature Requests
Describe the **problem you're trying to solve**, not just the feature you want. Example: "I need to compare three teams side by side for a committee discussion" is more useful than "add a multi-select to the Scout page."

### Data Corrections
If a game result or stat looks wrong:
- Provide the specific team, opponent, and game date
- Include what the correct values should be
- Note that data issues often originate at Presto Sports (the upstream source) and may need to be corrected there first

### Timeline Expectations
- Bug fixes: typically 1-2 days
- New features: 1-4 weeks depending on complexity
- Data corrections from upstream: outside our direct control
