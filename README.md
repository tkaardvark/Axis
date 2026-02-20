# Axis Analytics

NAIA basketball analytics platform providing advanced statistics, team ratings, tournament projections, and scouting tools for all NAIA member institutions.

## Tech Stack

- **Frontend:** React 19 + Vite 7 + Recharts 3.7 + React Router 7
- **Backend:** Express 5 + PostgreSQL (via `pg`)
- **Deployment:** Render.com (static site + API service + managed PostgreSQL)
- **Data Pipeline:** Puppeteer web scraping + node-cron scheduler
- **Styling:** Custom CSS with CSS variables (light/dark theme support)

## Prerequisites

- Node.js 18.x
- PostgreSQL (local instance or remote connection string)
- npm

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url> && cd axis-analytics

# 2. Set up environment variables
cp .env.example .env
# Edit .env and fill in your DATABASE_URL

# 3. Install dependencies
npm install
cd client && npm install && cd ..

# 4. Set up the database (creates tables and indexes)
npm run setup-db

# 5. Populate data (scrape + import + calculate — takes ~30 min)
npm run refresh

# 6. Start the API server
npm run dev

# 7. In a separate terminal, start the frontend dev server
cd client && npm run dev
```

The API runs on `http://localhost:3001` and the frontend dev server on `http://localhost:5173`.

## Project Structure

```
axis-analytics/
├── server.js                  # Express API server (all routes and business logic)
├── scheduler.js               # node-cron job scheduler (runs in production)
├── package.json               # Root dependencies + npm scripts
├── render.yaml                # Render.com deployment configuration
│
├── config/
│   └── excluded-teams.js      # Non-NAIA teams excluded from calculations
│
├── migrations/
│   └── 001_create_players_table.sql
│
├── [Data Pipeline Scripts]
│   ├── scrape-team-urls.js    # Scrape Presto Sports for team data URLs
│   ├── scrape-conferences.js  # Scrape conference assignments
│   ├── scrape-logos.js        # Scrape team logos
│   ├── import-data.js         # Import game results from Presto Sports
│   ├── import-players.js      # Import individual player statistics
│   ├── calculate-analytics.js # Calculate advanced metrics (RPI, adj ratings, etc.)
│   ├── refresh-data.js        # Orchestrate full data refresh
│   └── setup-database.js      # Create database tables and indexes
│
├── team-urls-*.json           # Cached team URL mappings per season
│
├── client/                    # React frontend application
│   ├── src/
│   │   ├── App.jsx            # Root component with routing and state
│   │   ├── main.jsx           # React entry point
│   │   ├── index.css          # Global styles and CSS variable tokens
│   │   ├── contexts/
│   │   │   └── ThemeContext.jsx
│   │   └── components/        # All UI components (JSX + CSS pairs)
│   ├── index.html             # HTML template
│   ├── vite.config.js         # Vite build configuration
│   └── package.json           # Client dependencies
│
└── docs/                      # Documentation
    ├── data-pipeline.md       # Data pipeline architecture
    ├── database-schema.md     # Database tables and relationships
    ├── api-reference.md       # API endpoint documentation
    └── stakeholder-overview.md # Non-technical overview
```

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the production API server |
| `npm run dev` | Start the API server in development mode |
| `npm run build` | Build the frontend for production |
| `npm run setup-db` | Create database tables and indexes |
| `npm run scrape` | Scrape team URLs from Presto Sports |
| `npm run import` | Import game data into the database |
| `npm run conferences` | Scrape conference assignments |
| `npm run analytics` | Calculate advanced metrics |
| `npm run refresh` | Full pipeline: scrape + import + conferences + analytics |
| `npm run refresh:cron` | Run the refresh orchestrator (used by scheduler) |
| `npm run scrape:2024` | Scrape team URLs for 2024-25 season |
| `npm run import:2024` | Import game data for 2024-25 season |
| `npm run conferences:2024` | Scrape conferences for 2024-25 season |
| `npm run analytics:2024` | Calculate analytics for 2024-25 season |
| `npm run refresh:2024` | Full pipeline for 2024-25 season |

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Teams | `/` | Team statistics table with sorting, filtering, and a charts view |
| Players | `/players` | Individual player statistics with filtering and sorting |
| Conferences | `/conferences` | Conference standings, power rankings, and head-to-head matrices |
| Bracketcast | `/bracketcast` | National tournament seeding projections |
| Scout | `/scout` | Team comparison with radar charts, matchups, and season trajectory |

## Data Pipeline

Data is sourced from Presto Sports (the official NAIA statistics provider) and processed through these steps:

1. **Scrape team URLs** — discover team data endpoints for the season
2. **Import game data** — pull game results and box scores into PostgreSQL
3. **Scrape conferences** — get conference membership assignments
4. **Calculate analytics** — derive advanced metrics (efficiency ratings, RPI, adjusted ratings, SOS)
5. **Import players** — pull individual player statistics

In production, this pipeline runs automatically via `scheduler.js`:
- **Midnight ET:** Scrape team URLs + conferences
- **Every 4 hours:** Import games + recalculate analytics
- **3:00 AM ET:** Import player stats

See [docs/data-pipeline.md](docs/data-pipeline.md) for details.

## Deployment

The application deploys to Render.com via `render.yaml`:
- **API:** Node.js web service running `server.js` (includes the scheduler)
- **Frontend:** Static site built from `client/dist`
- **Database:** Managed PostgreSQL instance

## Documentation

- [Data Pipeline](docs/data-pipeline.md) — how data is scraped, imported, and calculated
- [Database Schema](docs/database-schema.md) — tables, columns, relationships, and indexes
- [API Reference](docs/api-reference.md) — all API endpoints with parameters and response shapes
- [Stakeholder Overview](docs/stakeholder-overview.md) — non-technical guide for business stakeholders
