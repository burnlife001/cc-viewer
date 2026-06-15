# cc-viewer — Claude Code Session Viewer

A lightweight local web application for viewing and exporting Claude Code session history.

## Features

- **Browse** all Claude Code sessions with search and sort
- **Read** full conversation history with virtual scrolling
- **Search** across session titles and content
- **Export** sessions as Markdown or JSONL
- **Open** session files in your system file manager

## Quick Start

```bash
# Install dependencies
bun install

# Start dev server (frontend + API)
bun run dev

# Or build for production
bun run build
bun run start
```

The app opens at `http://localhost:5173`. The API server runs on port 3001.

## How It Works

cc-viewer scans your local Claude Code session directory (`~/.claude/projects/`) to discover and display session JSONL files. Everything runs locally — no data leaves your machine.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js (TypeScript)
- **Build**: Vite
