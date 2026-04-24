# Text to OMOP Query

A two-stage natural language interface for querying OMOP CDM databases. Type a plain English question, review the generated SQL, then approve or reject it before anything touches your database.

## Prerequisites

- Node.js 18+
- An Anthropic API key
- Access to a Microsoft SQL Server OMOP database

## Setup

Clone the repo, then install dependencies for both the backend and frontend.

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

Create a `.env` file in the `server/` directory:

```env
API_KEY=your_anthropic_api_key_here
```

## Running

Start the backend and frontend in separate terminals.

**Backend** (runs on port 3001):

```bash
cd backend
node .
```

**Frontend** (runs on port 5173 by default):

```bash
cd frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

1. Click **config** in the top right and enter your database host, database name, and credentials
2. Select an Anthropic model (Sonnet 4.6 is the default)
3. Type a plain English question and press Enter
4. Review the generated SQL — it will appear highlighted in green awaiting your approval
5. Click **approve & run** to execute it, or **reject** to discard it

The database is never touched until you explicitly approve the query. The backend also enforces a server-side check that rejects any non-`SELECT` statement regardless of what the AI generates.

## Stack

- **Frontend** — React + TypeScript (Vite)
- **Backend** — Node.js + Express
- **AI** — Anthropic Messages API with tool use
- **Database** — Microsoft SQL Server via `mssql`