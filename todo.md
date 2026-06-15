# cc-viewer — Session Viewer Implementation Plan

> Extract session management UI from `cc-switch` into a standalone pure-web viewer.
> **Scope**: Read-only viewer + Markdown/JSONL export, Claude Code only, cross-platform.

---

## Phase 0: Project Scaffolding (Vite + React + Tailwind)

- [ ] **0.1** Initialize Vite + React + TypeScript project in `00.cc-viewer`
  - `pnpm create vite . --template react-ts` (or bun)
  - Configure `tsconfig.json` with `@/` path alias matching cc-switch conventions
- [ ] **0.2** Install core dependencies
  - React 18, react-dom, react-i18next, i18next
  - Tailwind CSS 3 + postcss + autoprefixer
  - shadcn/ui (init with `components.json`)
  - lucide-react, @tanstack/react-virtual, flexsearch, clsx, tailwind-merge
  - sonner (toast notifications)
- [ ] **0.3** Copy & adapt build config from cc-switch
  - `tailwind.config.cjs` — copy theme colors/fonts, remove Tauri-specific
  - `postcss.config.cjs` — direct copy
  - `vite.config.ts` — adapt (remove Tauri plugin, keep react + path alias)
- [ ] **0.4** Set up directory structure (mirror cc-switch conventions)
  ```
  src/
    components/
      sessions/      # Session UI components (copied & adapted)
      ui/            # shadcn/ui components (copied)
      ProviderIcon.tsx
    hooks/           # React hooks (useSessionSearch)
    lib/
      api/           # API client (fetch → local backend)
      utils.ts       # cn() helper
    types.ts         # SessionMeta, SessionMessage
    utils/
      errorUtils.ts
    i18n/            # Translation files (session-related keys only)
      locales/
        en.json
        zh.json
    App.tsx
    main.tsx
  server/            # Express backend (session scanning + API)
    index.ts
    providers/
      claude.ts      # Port from Rust → TS
  ```

---

## Phase 1: Copy & Adapt Frontend Components

### 1.1 Types (extract from cc-switch `src/types.ts`)
- [ ] Copy `SessionMeta` interface (lines 430-440)
- [ ] Copy `SessionMessage` interface (lines 442-446)
- [ ] File: `src/types.ts`

### 1.2 UI Components (shadcn/ui — copy from cc-switch `src/components/ui/`)
- [ ] `button.tsx`
- [ ] `input.tsx`
- [ ] `badge.tsx`
- [ ] `card.tsx`
- [ ] `scroll-area.tsx`
- [ ] `dialog.tsx`
- [ ] `tooltip.tsx`
- [ ] These depend on `@/lib/utils` (cn) — already copied in 0.2

### 1.3 Utility Files
- [ ] Copy `src/lib/utils.ts` (cn function) — direct copy
- [ ] Copy `src/utils/errorUtils.ts` (extractErrorMessage) — direct copy
- [ ] Copy `src/lib/platform.ts` (isMac) — direct copy

### 1.4 ProviderIcon Component
- [ ] Copy `src/components/ProviderIcon.tsx` — simplify for single-provider:
  - Only need Claude icon
  - Copy minimal SVG icon inline, or copy `src/icons/extracted/` module from cc-switch

### 1.5 Session Components (core — from `src/components/sessions/`)
- [ ] Copy `utils.ts` — adapt:
  - Remove: Codex IDE context helpers (`shouldHideCodexMessageFromToc`, `extractCodexPromptPreview`, `CODEX_IDE_CONTEXT_PREFIX`, etc.)
  - Remove: `getProviderIconName` (only claude)
  - Remove: `getProviderLabel` not needed for single provider
  - Keep: `getSessionKey`, `getBaseName`, `formatTimestamp`, `formatRelativeTime`, `getRoleTone`, `getRoleLabel`, `formatSessionTitle`, `highlightText`, `formatSessionMessagePreview`
- [ ] Copy `SessionMessageItem.tsx` — direct copy (no Tauri deps, remove role-based color since only Claude)
- [ ] Copy `SessionToc.tsx` — direct copy (no Tauri deps)
- [ ] Copy `SessionItem.tsx` — adapt:
  - Remove `selectionMode`, `isChecked`, `isCheckDisabled`, `onToggleChecked` props
  - Remove Checkbox import, ProviderIcon complexity (only Claude icon)
  - Simplify to just: session, isSelected, searchQuery, onSelect
- [ ] Copy `SessionManagerPage.tsx` — major adaptation:
  - **Remove**: Tauri invoke calls → replace with `fetch()` to local API
  - **Remove**: Delete functionality (useDeleteSessionMutation, delete buttons, ConfirmDialog, batch selection)
  - **Remove**: Terminal resume (handleResume, isMac check for terminal)
  - **Remove**: Provider filter dropdown (only Claude, no filter needed)
  - **Remove**: Selection mode / batch delete UI
  - **Add**: Export button (Markdown / JSONL)
  - **Keep**: Session list, search, detail view, virtual scrolling, TOC
  - **Change**: `appId` prop → remove, default to `"claude"`

### 1.6 Query Hooks (adapt from `src/lib/query/`)
- [ ] Create `src/hooks/useSessions.ts`:
  - Replace `sessionsApi.list()` (Tauri invoke) → `fetch('/api/sessions')`
  - Use `@tanstack/react-query` useQuery
- [ ] Create `src/hooks/useSessionMessages.ts`:
  - Replace `sessionsApi.getMessages()` → `fetch('/api/sessions/${sourcePath}/messages')`
- [ ] Copy `src/hooks/useSessionSearch.ts` — direct copy (pure JS, no Tauri deps), simplify providerFilter

### 1.7 i18n
- [ ] Extract session-related translation keys from cc-switch `src/i18n/locales/`
- [ ] Create minimal `zh.json` + `en.json` with only session-manager keys
- [ ] Set up i18next in `main.tsx`

### 1.8 Export Feature (NEW)
- [ ] Create `src/components/sessions/ExportMenu.tsx`:
  - Dropdown button: "Export as Markdown" / "Export as JSONL"
  - Markdown: use logic from `extract_clean_conversation.py` (TypeScript port)
  - JSONL: download the raw source file
  - Uses `navigator.clipboard` or triggers file download via Blob URL

---

## Phase 2: Backend — Session Scanner (Node.js/Express)

> Port the Rust session scanning logic from `src-tauri/src/session_manager/providers/claude.rs` to TypeScript.
> Only Claude Code provider.

### 2.1 Express Server Setup
- [ ] Create `server/index.ts`
- [ ] Endpoints:
  - `GET /api/sessions` → scan + return `SessionMeta[]`
  - `GET /api/sessions/messages?sourcePath=...` → return `SessionMessage[]`
  - `GET /api/sessions/export?sourcePath=...&format=jsonl` → download raw file
- [ ] CORS enabled for dev (Vite dev server on different port)
- [ ] In production: serve built React app + API on same port

### 2.2 Claude Provider Scanner (`server/providers/claude.ts`)
Port `src-tauri/src/session_manager/providers/claude.rs`:
- [ ] `getClaudeConfigDir()` → `~/.claude` (platform-aware: macOS/Linux/Windows)
- [ ] `scanSessions()` → scan `~/.claude/projects/` recursively for `*.jsonl`
  - Skip `agent-*` prefixed files (sub-agent sessions)
- [ ] `parseSession(path)` → read head 10 lines + tail 30 lines, extract:
  - `sessionId` from JSON `sessionId` field (or filename stem)
  - `projectDir` from JSON `cwd` field
  - `createdAt` from first `timestamp`
  - `title` from: custom-title > first real user message > directory basename
  - `summary` from last message in tail (truncate to 160 chars)
  - `lastActiveAt` from last `timestamp`
  - Skip: `<local-command-caveat>` messages, `<command-name>` slash commands
- [ ] `loadMessages(path)` → parse JSONL, extract user/assistant/tool messages
  - Reclassify `user` messages containing only `tool_result` as `tool` role
  - Handle `tool_use` content blocks (show as `[Tool: name]`)
  - Handle mixed content arrays (text + tool_use)
  - Skip empty content, skip `isMeta` entries
  - Extract timestamp from `timestamp` field

### 2.3 Startup Script
- [ ] `package.json` scripts:
  - `dev`: start Vite dev server + Express API server concurrently
  - `build`: build React app
  - `start`: run production server (serve static + API)
- [ ] Server auto-detects Claude data directories per platform:
  - macOS: `~/Library/Application Support/Claude/projects/` or `~/.claude/projects/`
  - Windows: `%APPDATA%/Claude/projects/` or `%USERPROFILE%/.claude/projects/`
  - Linux: `~/.claude/projects/`

---

## Phase 3: Integration & Polish

- [ ] **3.1** Wire frontend to backend API (replace Tauri invoke with fetch)
- [ ] **3.2** Implement Markdown export (port `extract_clean_conversation.py` logic to TS)
- [ ] **3.3** Implement JSONL export (direct file download)
- [ ] **3.4** Add "Open in Folder" button (reveal source file in OS file manager)
- [ ] **3.5** Responsive layout (already mostly responsive from cc-switch)
- [ ] **3.6** Error handling: session file parse failures, missing directories, empty state
- [ ] **3.7** Loading states (skeleton UI while scanning)

---

## Phase 4: Testing & Documentation

- [ ] **4.1** Unit tests for session parsing (port Rust test cases to TS)
  - Claude: title extraction, custom-title override, caveat/slash-command skipping, fallback to dir basename
  - Claude: message loading — tool_use reclassification, mixed content, timestamp parsing
- [ ] **4.2** Manual E2E test with real Claude Code session data
- [ ] **4.3** `README.md` — how to install, run, configure custom paths
- [ ] **4.4** `CLAUDE.md` — project architecture for future AI agents

---

## File Copy Map (cc-switch → cc-viewer)

| Source (`00.cc-switch/`) | Target (`00.cc-viewer/`) | Action |
|---|---|---|
| `src/components/sessions/SessionMessageItem.tsx` | `src/components/sessions/SessionMessageItem.tsx` | Copy as-is |
| `src/components/sessions/SessionToc.tsx` | `src/components/sessions/SessionToc.tsx` | Copy as-is |
| `src/components/sessions/SessionItem.tsx` | `src/components/sessions/SessionItem.tsx` | Adapt (simplify for single provider) |
| `src/components/sessions/SessionManagerPage.tsx` | `src/components/sessions/SessionManagerPage.tsx` | Major adapt (read-only + export) |
| `src/components/sessions/utils.ts` | `src/components/sessions/utils.ts` | Adapt (remove Codex helpers) |
| `src/components/ProviderIcon.tsx` | `src/components/ProviderIcon.tsx` | Adapt (Claude icon only) |
| `src/icons/extracted/` | `src/icons/extracted/` | Copy (Claude icon SVGs only) |
| `src/hooks/useSessionSearch.ts` | `src/hooks/useSessionSearch.ts` | Copy as-is |
| `src/types.ts` (SessionMeta + SessionMessage) | `src/types.ts` | Extract only session types |
| `src/lib/utils.ts` | `src/lib/utils.ts` | Copy as-is |
| `src/utils/errorUtils.ts` | `src/utils/errorUtils.ts` | Copy as-is |
| `src/lib/platform.ts` | `src/lib/platform.ts` | Copy as-is |
| `src/lib/api/sessions.ts` | — | **Delete** (replace with fetch) |
| `src/lib/query/queries.ts` | `src/hooks/useSessions.ts` + `useSessionMessages.ts` | Rewrite for fetch API |
| `src/lib/query/mutations.ts` | — | **Delete** (no mutations in v1) |
| `src/components/ConfirmDialog.tsx` | — | **Delete** (no delete in v1) |
| `src/components/ui/button.tsx` | `src/components/ui/button.tsx` | Copy as-is |
| `src/components/ui/input.tsx` | `src/components/ui/input.tsx` | Copy as-is |
| `src/components/ui/badge.tsx` | `src/components/ui/badge.tsx` | Copy as-is |
| `src/components/ui/card.tsx` | `src/components/ui/card.tsx` | Copy as-is |
| `src/components/ui/scroll-area.tsx` | `src/components/ui/scroll-area.tsx` | Copy as-is |
| `src/components/ui/dialog.tsx` | `src/components/ui/dialog.tsx` | Copy as-is |
| `src/components/ui/tooltip.tsx` | `src/components/ui/tooltip.tsx` | Copy as-is |
| `tailwind.config.cjs` | `tailwind.config.cjs` | Adapt (remove Tauri specifics) |
| `postcss.config.cjs` | `postcss.config.cjs` | Copy as-is |
| `src/i18n/locales/` | `src/i18n/locales/` | Extract session keys only |
| `src-tauri/src/session_manager/providers/claude.rs` | `server/providers/claude.ts` | Port Rust → TypeScript |

---

## Dependencies to Install

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-i18next": "^15.0.0",
    "i18next": "^24.0.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-virtual": "^3.0.0",
    "flexsearch": "^0.7.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "sonner": "^1.0.0",
    "class-variance-authority": "^0.7.0",
    "express": "^4.18.0",
    "cors": "^2.8.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^7.0.0",
    "concurrently": "^8.0.0",
    "tsx": "^4.0.0"
  }
}
```
