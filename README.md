# Second Brain

A self-hosted, AI-powered personal knowledge management system that captures thoughts, classifies them automatically, and surfaces what matters – without external service dependencies.

## Features

- **Frictionless Capture**: Capture thoughts via chat UI or REST API
- **Automatic Classification**: AI classifies entries into people, projects, ideas, or admin tasks
- **Markdown Storage**: All data stored as plain markdown files with YAML frontmatter
- **Git Version Control**: Every change creates a git commit for full audit trail
- **Auto-Generated Index**: Always up-to-date index.md summarizing all entries
- **Self-Hosted**: Your data stays on your machine

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- OpenAI API key

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd second-brain
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables**
   Edit `.env` and set:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `API_KEY`: A secure random string for API authentication
   - `DATA_PATH`: Path to your memory directory (default: `./memory`)

4. **Start with Docker Compose**
   ```bash
   docker compose up -d --build
   ```

5. **Access the application**
   Open http://localhost:3000 in your browser

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for classification |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `API_KEY` | Yes | - | API authentication key |
| `DATA_PATH` | Yes | - | Path to memory directory |
| `TIMEZONE` | No | `Europe/Berlin` | Timezone for timestamps |
| `CONFIDENCE_THRESHOLD` | No | `0.6` | Classification confidence threshold |
| `PORT` | No | `3000` | Server port |

## Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start PostgreSQL**
   ```bash
   docker compose up -d db
   ```

3. **Run database migrations**
   ```bash
   cd backend
   npx prisma migrate dev
   ```

4. **Start backend in development mode**
   ```bash
   npm run dev
   ```

5. **Start frontend in development mode** (in another terminal)
   ```bash
   npm run dev:frontend
   ```

## Project Structure

```
second-brain/
├── docker-compose.yml      # Docker Compose configuration
├── package.json            # Root workspace configuration
├── .env.example            # Environment variables template
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── services/       # API client
│   │   └── App.tsx         # Main application
│   └── ...
├── backend/                # Express.js backend
│   ├── src/
│   │   ├── config/         # Environment configuration
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   └── types/          # TypeScript types
│   ├── prisma/             # Database schema
│   └── tests/              # Test files
└── memory/                 # Memory directory (gitignored)
    ├── .git/               # Git repository for data
    ├── index.md            # Auto-generated index
    ├── people/             # People entries
    ├── projects/           # Project entries
    ├── ideas/              # Idea entries
    ├── admin/              # Admin task entries
    └── inbox/              # Low-confidence entries
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (no auth) |
| GET | `/api/entries` | List entries |
| GET | `/api/entries/:path` | Get single entry |
| POST | `/api/entries` | Create entry |
| PATCH | `/api/entries/:path` | Update entry |
| DELETE | `/api/entries/:path` | Delete entry |
| GET | `/api/index` | Get index.md content |

All endpoints except `/api/health` require authentication via Bearer token.

## Running Tests

```bash
# Run all tests
npm test

# Run backend tests only
npm run test:backend

# Run tests with coverage
cd backend && npm run test:coverage
```

## License

MIT
