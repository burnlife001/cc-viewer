#!/usr/bin/env python3
"""Extract clean conversation directly from Claude session storage.

Usage:
    extract_clean_conversation.py <session-id>           # read from ~/.claude/projects/
    extract_clean_conversation.py <raw_messages.jsonl>   # read from cctrace export (fallback)
"""

import json
import sys
from datetime import datetime
from pathlib import Path


CLAUDE_PROJECTS = Path.home() / ".claude" / "projects"


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


def extract_text_blocks(content: list) -> list[str]:
    """Extract only text blocks from message content, ignoring tool_use/tool_result/thinking."""
    texts = []
    if not isinstance(content, list):
        return texts
    for block in content:
        if block.get("type") == "text":
            texts.append(block["text"])
    return texts


def extract_conversation(jsonl_path: Path) -> list[dict]:
    """Extract clean user/assistant conversation from a Claude jsonl file."""
    messages = []

    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            msg = json.loads(line)
            msg_type = msg.get("type")

            if msg_type not in ("user", "assistant"):
                continue

            inner = msg.get("message", {})
            content = inner.get("content", [])
            texts = extract_text_blocks(content)

            if not texts:
                continue

            messages.append({
                "role": inner.get("role", msg_type),
                "timestamp": msg.get("timestamp", ""),
                "text": "\n\n".join(texts),
            })

    return messages


def format_conversation(messages: list[dict]) -> str:
    """Format messages as clean Markdown, only first message has date."""
    lines = ["# Claude Code Session — Clean Conversation\n"]
    first_ts_printed = False

    def format_ts(ts: str) -> str:
        if not ts:
            return ""
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, AttributeError):
            return ts

    for msg in messages:
        if not first_ts_printed:
            ts_str = format_ts(msg["timestamp"])
            if ts_str:
                first_ts_printed = True
                lines.append(f"**[{ts_str}]**\n")

        role = msg["role"]
        text = msg["text"]

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

    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: extract_clean_conversation.py <session-id | jsonl-path>")
        print("  session-id: reads from ~/.claude/projects/<project>/<id>.jsonl")
        print("  jsonl-path: reads from a cctrace export or any Claude jsonl")
        sys.exit(1)

    arg = sys.argv[1]

    # Try as session ID first (UUID format)
    jsonl_path = find_session_jsonl(arg)

    if jsonl_path:
        print(f"📖 Source: Claude session storage ({jsonl_path})")
    else:
        # Fallback: treat as file path
        jsonl_path = Path(arg)
        if not jsonl_path.exists():
            print(f"❌ Session '{arg}' not found in ~/.claude/projects/")
            print(f"❌ File not found: {arg}")
            sys.exit(1)
        print(f"📖 Source: local file ({jsonl_path})")

    messages = extract_conversation(jsonl_path)

    user_count = sum(1 for m in messages if m["role"] == "user")
    asst_count = sum(1 for m in messages if m["role"] == "assistant")
    print(f"📊 {len(messages)} messages ({user_count} user, {asst_count} assistant)")

    output = format_conversation(messages)

    out_path = Path.cwd() / "conversation_clean.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"✅ Written: {out_path}")


if __name__ == "__main__":
    main()
