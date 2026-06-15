import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROVIDER_ID = "claude";
const TITLE_MAX_CHARS = 80;

// ---- Types ----

interface SessionMeta {
  providerId: string;
  sessionId: string;
  title?: string;
  summary?: string;
  projectDir?: string | null;
  createdAt?: number;
  lastActiveAt?: number;
  sourcePath?: string;
  resumeCommand?: string;
}

interface SessionMessage {
  role: string;
  content: string;
  ts?: number;
}

// ---- Config Directory ----

function getClaudeConfigDir(): string {
  // Claude Code CLI uses ~/.claude on all platforms
  const primary = path.join(os.homedir(), ".claude");

  // Also try platform-specific paths
  const candidates = [primary];
  if (process.platform === "darwin") {
    candidates.push(
      path.join(os.homedir(), "Library", "Application Support", "Claude"),
    );
  } else if (process.platform === "win32") {
    candidates.push(
      path.join(
        process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
        "Claude",
      ),
    );
  }

  // Return the first directory that exists (with projects subdir), or the primary
  for (const dir of candidates) {
    const projectsDir = path.join(dir, "projects");
    if (fs.existsSync(projectsDir)) {
      return dir;
    }
  }

  return primary;
}

// ---- Session Scanning ----

export function scanSessions(): SessionMeta[] {
  const root = path.join(getClaudeConfigDir(), "projects");
  const files = collectJsonlFiles(root);
  const sessions: SessionMeta[] = [];

  for (const filePath of files) {
    const meta = parseSession(filePath);
    if (meta) {
      sessions.push(meta);
    }
  }

  sessions.sort((a, b) => {
    const aTs = a.lastActiveAt ?? a.createdAt ?? 0;
    const bTs = b.lastActiveAt ?? b.createdAt ?? 0;
    return bTs - aTs;
  });

  return sessions;
}

// ---- Message Loading ----

export function loadMessages(filePath: string): SessionMessage[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const messages: SessionMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    let value: any;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }

    if (value.isMeta === true) continue;

    const message = value.message;
    if (!message) continue;

    let role = message.role || "unknown";

    // Reclassify user messages containing only tool_result as "tool"
    if (role === "user") {
      if (Array.isArray(message.content) && message.content.length > 0) {
        const allToolResults = message.content.every(
          (item: any) => item.type === "tool_result",
        );
        if (allToolResults) {
          role = "tool";
        }
      }
    }

    const textContent = cleanContent(extractText(message.content));
    if (!textContent.trim()) continue;

    const ts = parseTimestampToMs(value.timestamp);

    messages.push({ role, content: textContent, ts });
  }

  return messages;
}

// ---- Session Parsing ----

function parseSession(filePath: string): SessionMeta | null {
  // Skip agent sub-sessions
  const fileName = path.basename(filePath);
  if (fileName.startsWith("agent-")) {
    return null;
  }

  const { head, tail } = readHeadTailLines(filePath, 10, 30);

  let sessionId: string | null = null;
  let projectDir: string | null = null;
  let createdAt: number | undefined;
  let firstUserMessage: string | null = null;

  // Parse head lines for metadata
  for (const line of head) {
    let value: any;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }

    if (!sessionId) {
      sessionId = value.sessionId ?? null;
    }
    if (!projectDir) {
      projectDir = value.cwd ?? null;
    }
    if (createdAt === undefined) {
      createdAt = parseTimestampToMs(value.timestamp);
    }

    // Extract first real user message as title candidate
    if (!firstUserMessage) {
      const isUser =
        value.type === "user" || value.message?.role === "user";
      if (isUser && value.message) {
        const text = cleanContent(extractText(value.message.content));
        if (text) {
          firstUserMessage = text;
        }
      }
    }

    if (sessionId && projectDir && createdAt !== undefined && firstUserMessage) {
      break;
    }
  }

  // Parse tail lines (reverse) for last_active_at, summary, custom-title
  let lastActiveAt: number | undefined;
  let summary: string | null = null;
  let customTitle: string | null = null;

  for (let i = tail.length - 1; i >= 0; i--) {
    let value: any;
    try {
      value = JSON.parse(tail[i]);
    } catch {
      continue;
    }

    if (lastActiveAt === undefined) {
      lastActiveAt = parseTimestampToMs(value.timestamp);
    }

    if (!customTitle && value.type === "custom-title") {
      const t = value.customTitle?.trim();
      if (t) customTitle = t;
    }

    if (!summary) {
      if (value.isMeta === true) continue;
      if (value.message) {
        const text = extractText(value.message.content).trim();
        if (text) summary = text;
      }
    }

    if (lastActiveAt !== undefined && summary && customTitle) {
      break;
    }
  }

  // Fallback: infer sessionId from filename stem
  if (!sessionId) {
    const stem = path.basename(filePath, path.extname(filePath));
    if (stem) sessionId = stem;
  }
  if (!sessionId) return null;

  // Title priority: custom-title > first user message > directory basename
  const dirBasename = pathBasename(projectDir);
  const title =
    customTitle
      ? truncateSummary(customTitle, TITLE_MAX_CHARS)
      : firstUserMessage
        ? truncateSummary(firstUserMessage, TITLE_MAX_CHARS)
        : dirBasename || undefined;

  const finalSummary = summary
    ? truncateSummary(summary, 160)
    : undefined;

  return {
    providerId: PROVIDER_ID,
    sessionId,
    title,
    summary: finalSummary,
    projectDir,
    createdAt,
    lastActiveAt,
    sourcePath: filePath,
    resumeCommand: `claude --resume ${sessionId}`,
  };
}

// ---- Helpers ----

function collectJsonlFiles(root: string): string[] {
  const files: string[] = [];
  _collect(root);
  return files;

  function _collect(dir: string) {
    if (!fs.existsSync(dir)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        _collect(fullPath);
      } else if (entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }
}

function readHeadTailLines(
  filePath: string,
  headN: number,
  tailN: number,
): { head: string[]; tail: string[] } {
  const content = fs.readFileSync(filePath, "utf-8");
  const all = content.split("\n").filter((l) => l.trim());

  const head = all.slice(0, headN);
  const tail = all.slice(Math.max(0, all.length - tailN));

  return { head, tail };
}

function parseTimestampToMs(value: any): number | undefined {
  if (typeof value === "number") {
    if (value > 1_000_000_000_000) return value;
    return value * 1000;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!isNaN(ms)) return ms;
  }
  return undefined;
}

function extractText(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item: any) => {
      const itemType = item.type || "";

      // tool_use: show tool name
      if (itemType === "tool_use") {
        const name = item.name || "unknown";
        return `[Tool: ${name}]`;
      }

      // tool_result: extract nested content
      if (itemType === "tool_result") {
        if (item.content) {
          const text = extractText(item.content);
          if (text) return text;
        }
        return null;
      }

      // Text from various fields
      if (item.text) return item.text;
      if (item.input_text) return item.input_text;
      if (item.output_text) return item.output_text;
      if (item.content) return extractText(item.content);

      return null;
    })
    .filter((t: string | null): t is string => t !== null && t.trim().length > 0)
    .join("\n");
}

// System-injected XML tags that pollute session content.
// These come from Claude Code harness, not from the user or AI.
const SYSTEM_TAGS = [
  "system-reminder",
  "local-command-caveat",
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "ide_selection",
  "ide_opened_file",
  "persisted-output",
];

const SYSTEM_TAG_RE = new RegExp(
  SYSTEM_TAGS.map((t) => `<${t}[^>]*>[\\s\\S]*?<\\/${t}>`).join("|"),
  "gi",
);

function cleanContent(text: string): string {
  return text.replace(SYSTEM_TAG_RE, "").trim();
}

function truncateSummary(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars) + "...";
}

function pathBasename(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[/\\]+$/, "");
  const parts = normalized.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || null;
}

export { PROVIDER_ID };
export type { SessionMeta, SessionMessage };
