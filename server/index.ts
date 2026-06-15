import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { scanSessions, loadMessages } from "./providers/claude";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ---- API Routes ----

// GET /api/sessions — list all Claude Code sessions
app.get("/api/sessions", (_req, res) => {
  try {
    const sessions = scanSessions();
    res.json(sessions);
  } catch (error: any) {
    console.error("[api] Failed to scan sessions:", error.message);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /api/sessions/messages?sourcePath=... — load messages for a session
app.get("/api/sessions/messages", (req, res) => {
  try {
    const sourcePath = req.query.sourcePath as string;
    if (!sourcePath) {
      res.status(400).json({ error: "sourcePath is required" });
      return;
    }

    const messages = loadMessages(sourcePath);
    res.json(messages);
  } catch (error: any) {
    console.error("[api] Failed to load messages:", error.message);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /api/sessions/export?sourcePath=... — download raw JSONL
app.get("/api/sessions/export", (req, res) => {
  try {
    const sourcePath = req.query.sourcePath as string;
    if (!sourcePath) {
      res.status(400).json({ error: "sourcePath is required" });
      return;
    }

    const messages = loadMessages(sourcePath);
    res.json(messages);
  } catch (error: any) {
    console.error("[api] Failed to export session:", error.message);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /api/sessions/open-folder?sourcePath=... — open file in OS file manager
app.get("/api/sessions/open-folder", (req, res) => {
  try {
    const sourcePath = req.query.sourcePath as string;
    if (!sourcePath) {
      res.status(400).json({ error: "sourcePath is required" });
      return;
    }

    const folder = path.dirname(sourcePath);
    const file = sourcePath;

    switch (process.platform) {
      case "darwin":
        exec(`open -R "${file}"`);
        break;
      case "win32":
        exec(`explorer /select,"${file}"`);
        break;
      default:
        exec(`xdg-open "${folder}"`);
        break;
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error("[api] Failed to open folder:", error.message);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// In production: serve the built React app
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  if (res.headersSent) return;
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err && !res.headersSent) {
      res.status(404).end();
    }
  });
});

app.listen(PORT, () => {
  console.log(`[server] cc-viewer API running on http://localhost:${PORT}`);
  console.log(`[server] Claude config dir auto-detected`);
});
