#!/usr/bin/env python3
"""Extract clean conversation from Claude Code session JSONL.

Aligns with server/providers/claude.ts message parsing logic.
Handles tool_use, tool_result, system tag filtering, and role reclassification.

Usage:
    extract_clean_conversation.py <session-id>           # read from ~/.claude/projects/
    extract_clean_conversation.py <raw_messages.jsonl>   # read from cctrace export (fallback)
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

# Force UTF-8 on Windows
sys.stdout.reconfigure(encoding="utf-8")


CLAUDE_PROJECTS = Path.home() / ".claude" / "projects"

# Mirrors server/system-tags.json
SYSTEM_TAGS = [
    "system-reminder",
    "local-command-caveat",
    "command-name",
    "command-message",
    "command-args",
    "local-command-stdout",
    "ide_selection",
    "ide_opened_file",
    "persisted-output",
]
SYSTEM_TAG_RE = re.compile(
    "|".join(
        rf"<{t}[^>]*>[\s\S]*?</{t}>"
        for t in SYSTEM_TAGS
    ),
    re.IGNORECASE,
)


def find_session_jsonl(session_id: str) -> Path | None:
    """Find a session .jsonl in Claude's project storage by session ID."""
    if not CLAUDE_PROJECTS.exists():
        return None
    for proj_dir in CLAUDE_PROJECTS.iterdir():
        if not proj_dir.is_dir():
            continue
        candidate = proj_dir / f"{session_id}.jsonl"
        if candidate.exists():
            return candidate
    return None


def clean_content(text: str) -> str:
    """Strip system-injected XML tags from message content."""
    return SYSTEM_TAG_RE.sub("", text).strip()


def extract_text(content) -> str:
    """Extract display text from Claude message content (string or array).

    Mirrors server/providers/claude.ts extractText():
    - string → return as-is
    - array → concat text blocks, tool_use → [Tool: name], tool_result → nested
    """
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""

    parts = []
    for item in content:
        if not isinstance(item, dict):
            continue
        item_type = item.get("type", "")

        if item_type == "tool_use":
            name = item.get("name", "unknown")
            parts.append(f"[Tool: {name}]")
        elif item_type == "tool_result":
            nested = item.get("content")
            if nested is not None:
                text = extract_text(nested)
                if text.strip():
                    parts.append(text)
        else:
            for field in ("text", "input_text", "output_text"):
                v = item.get(field)
                if isinstance(v, str) and v.strip():
                    parts.append(v)
                    break
            else:
                nested = item.get("content")
                if nested is not None:
                    text = extract_text(nested)
                    if text.strip():
                        parts.append(text)

    return "\n".join(parts)


def load_messages(jsonl_path: Path) -> list[dict]:
    """Parse Claude Code JSONL into clean messages.

    Mirrors server/providers/claude.ts loadMessages().
    """
    messages = []

    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Skip meta entries
            if value.get("isMeta") is True:
                continue

            message = value.get("message")
            if not message:
                continue

            role = message.get("role", "unknown")
            content = message.get("content", "")

            # Reclassify user messages containing only tool_result as "tool"
            if role == "user" and isinstance(content, list) and content:
                if all(
                    isinstance(item, dict) and item.get("type") == "tool_result"
                    for item in content
                ):
                    role = "tool"

            text = clean_content(extract_text(content))
            if not text:
                continue

            ts = _parse_timestamp(value.get("timestamp"))

            messages.append({
                "role": role,
                "content": text,
                "ts": ts,
            })

    return messages


def _parse_timestamp(value) -> int | None:
    """Parse various timestamp formats to milliseconds."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        n = int(value)
        return n if n > 1_000_000_000_000 else n * 1000
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return int(dt.timestamp() * 1000)
        except (ValueError, AttributeError):
            pass
    return None


def format_conversation(messages: list[dict]) -> str:
    """Format messages as clean Markdown."""
    if not messages:
        return "# (empty session)\n"

    first_ts = messages[0].get("ts")
    lines = ["# Claude Code Session — Clean Conversation\n"]
    if first_ts:
        dt = datetime.fromtimestamp(first_ts / 1000)
        lines.append(f"**[{dt.strftime('%Y-%m-%d %H:%M')}]**\n")

    for msg in messages:
        role = msg["role"].lower()
        text = msg["content"]

        if role == "user":
            lines.append("---")
            lines.append("### 👤 User\n")
            lines.append(text)
            lines.append("")
        elif role == "assistant":
            lines.append("---")
            lines.append("### 🤖 Assistant\n")
            lines.append(text)
            lines.append("")
        elif role == "tool":
            lines.append("---")
            lines.append("### 🔧 Tool\n")
            lines.append(text)
            lines.append("")
        else:
            lines.append("---")
            lines.append(f"### ❓ {role}\n")
            lines.append(text)
            lines.append("")

    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: extract_clean_conversation.py <session-id | jsonl-path>")
        print("  session-id: reads from ~/.claude/projects/<project>/<id>.jsonl")
        print("  jsonl-path: reads from a cctrace export or any Claude jsonl")
        sys.exit(1)

    arg = sys.argv[1]

    # Try as session ID first
    jsonl_path = find_session_jsonl(arg)
    if jsonl_path:
        print(f"📖 Source: Claude session storage ({jsonl_path})")
    else:
        jsonl_path = Path(arg)
        if not jsonl_path.exists():
            print(f"❌ Session '{arg}' not found in ~/.claude/projects/")
            print(f"❌ File not found: {arg}")
            sys.exit(1)
        print(f"📖 Source: local file ({jsonl_path})")

    messages = load_messages(jsonl_path)

    user_count = sum(1 for m in messages if m["role"] == "user")
    asst_count = sum(1 for m in messages if m["role"] == "assistant")
    tool_count = sum(1 for m in messages if m["role"] == "tool")
    print(f"📊 {len(messages)} messages ({user_count} user, {asst_count} AI, {tool_count} tool)")

    output = format_conversation(messages)

    out_path = Path.cwd() / "conversation_clean.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"✅ Written: {out_path}")


if __name__ == "__main__":
    main()
