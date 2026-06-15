#!/usr/bin/env bash
# cc-viewer server manager
# Usage: ./server.sh [start|stop|restart|status]
#
# Note: On Windows (Git Bash / MSYS2), bash's `kill` cannot signal native
# Windows processes. We use tasklist / taskkill instead.

set -e

# ---- Color definitions ----
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_DIM='\033[2m'

C_RED='\033[31m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_BLUE='\033[34m'
C_MAGENTA='\033[35m'
C_CYAN='\033[36m'
C_WHITE='\033[37m'

# Bold + color combos
B_GREEN='\033[1;32m'
B_RED='\033[1;31m'
B_YELLOW='\033[1;33m'
B_CYAN='\033[1;36m'
B_MAGENTA='\033[1;35m'
B_WHITE='\033[1;37m'

# Emoji-less fallback markers
ICON_OK="✓"
ICON_ERR="✗"
ICON_WARN="⚠"
ICON_INFO="●"

PID_FILE=".server.pid"
PORT=3001

# ---- Platform helpers ----

is_win() {
  local u
  u=$(uname -s)
  [[ "$u" == MINGW* ]] || [[ "$u" == MSYS* ]] || [[ "$u" == CYGWIN* ]]
}

pid_running() {
  local pid="$1"
  if is_win; then
    # tasklist //FI "PID eq <n>" — MSYS2 converts // to / automatically
    tasklist //FI "PID eq $pid" 2>/dev/null | grep -q "$pid"
  else
    kill -0 "$pid" 2>/dev/null
  fi
}

kill_pid() {
  local pid="$1"
  if is_win; then
    taskkill //PID "$pid" //F 2>/dev/null
  else
    kill "$pid" 2>/dev/null || true
    sleep 1
    pid_running "$pid" && kill -9 "$pid" 2>/dev/null || true
  fi
}

find_by_port() {
  local out
  out=$(netstat -ano 2>/dev/null | grep -E ":$PORT\b.*LISTENING" | awk '{print $NF}' | head -1)
  if [ -z "$out" ] && ! is_win; then
    # Linux fallback
    out=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K\d+' | head -1)
  fi
  echo "$out"
}

wait_port_free() {
  local timeout="${1:-10}"
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    local pid
    pid=$(find_by_port)
    [ -z "$pid" ] && return 0
    sleep 1
    i=$((i + 1))
  done
  return 1
}

wait_port_used() {
  local timeout="${1:-15}"
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    local pid
    pid=$(find_by_port)
    if [ -n "$pid" ]; then
      if is_win || pid_running "$pid"; then
        echo "$pid"
        return 0
      fi
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# ---- Commands ----

stop() {
  echo -e "${C_DIM}──────────────────────────────────${C_RESET}"
  echo -e "${B_RED}  STOP${C_RESET}  cc-viewer server"
  echo ""

  local killed=0

  # Kill by PID file
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if [ -n "$pid" ] && pid_running "$pid"; then
      echo -e "  ${C_YELLOW}Killing pid $pid (from $PID_FILE)...${C_RESET}"
      kill_pid "$pid"
      sleep 1
      killed=1
    fi
    rm -f "$PID_FILE"
  fi

  # Kill by port scan
  local port_pid
  port_pid=$(find_by_port)
  if [ -n "$port_pid" ]; then
    echo -e "  ${C_YELLOW}Killing pid $port_pid (port $PORT)...${C_RESET}"
    kill_pid "$port_pid"
    sleep 1
    killed=1
  fi

  if [ "$killed" -eq 0 ]; then
    echo -e "  ${C_DIM}${ICON_INFO} No running server found.${C_RESET}"
  else
    # Verify port is actually free
    if wait_port_free 5; then
      echo -e "  ${B_GREEN}  ${ICON_OK} Server stopped.${C_RESET}"
    else
      echo -e "  ${B_YELLOW}  ${ICON_WARN} WARNING: Port $PORT may still be in use.${C_RESET}"
    fi
  fi
  echo ""
}

start() {
  echo -e "${C_DIM}──────────────────────────────────${C_RESET}"
  echo -e "${B_GREEN}  START${C_RESET}  cc-viewer server"
  echo ""

  # Prevent duplicate: if already running, stop first
  local port_pid
  port_pid=$(find_by_port)
  # Fallback: also check PID file
  if [ -z "$port_pid" ] && [ -f "$PID_FILE" ]; then
    local file_pid
    file_pid=$(cat "$PID_FILE")
    if [ -n "$file_pid" ] && pid_running "$file_pid"; then
      port_pid="$file_pid"
    fi
  fi
  if [ -n "$port_pid" ]; then
    echo -e "  ${C_YELLOW}Port $PORT already in use (pid $port_pid). Stopping first...${C_RESET}"
    stop
    sleep 1
    # Double-check port is free
    port_pid=$(find_by_port)
    if [ -n "$port_pid" ]; then
      echo -e "  ${B_RED}  ${ICON_ERR} ERROR: Cannot free port $PORT (still held by pid $port_pid).${C_RESET}"
      exit 1
    fi
  fi

  # Build frontend if not yet compiled (dist/ missing)
  if [ ! -d "dist" ]; then
    echo -e "  ${C_CYAN}${ICON_INFO} dist/ not found, building...${C_RESET}"
    bun run build
    echo -e "  ${B_GREEN}  ${ICON_OK} Build complete.${C_RESET}"
    echo ""
  fi

  echo -e "  ${C_CYAN}Starting server...${C_RESET}"
  bun run start 2>/dev/null &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  # Wait for server to actually bind
  local bound_pid
  bound_pid=$(wait_port_used 15)
  if [ -n "$bound_pid" ]; then
    echo "$bound_pid" > "$PID_FILE"
    echo -e "  ${B_GREEN}  ${ICON_OK} Server started (pid $bound_pid, port $PORT)${C_RESET}"
    echo ""
    echo -e "  ${B_WHITE}→ Open: http://localhost:$PORT${C_RESET}"
  else
    echo -e "  ${B_YELLOW}  ${ICON_WARN} WARNING: Process started (pid $pid) but port $PORT not detected.${C_RESET}"
    echo -e "  ${C_DIM}    Server may need more time to bind.${C_RESET}"
  fi
  echo ""
}

status() {
  echo -e "${C_DIM}──────────────────────────────────${C_RESET}"
  echo -e "${B_CYAN}  STATUS${C_RESET}  cc-viewer server"
  echo ""

  local port_pid
  port_pid=$(find_by_port)
  if [ -n "$port_pid" ] && pid_running "$port_pid"; then
    echo -e "  ${B_GREEN}${ICON_OK} Server is running${C_RESET}"
    echo -e "  ${B_WHITE}→ http://localhost:$PORT${C_RESET}"
    echo -e "  ${C_DIM}  pid: $port_pid${C_RESET}"
    if [ -f "$PID_FILE" ]; then
      echo -e "  ${C_DIM}  pid file: $(cat "$PID_FILE")${C_RESET}"
    fi
    echo ""
    return 0
  else
    # Port detected but pid_running failed (shouldn't happen on Windows now)
    if [ -n "$port_pid" ]; then
      echo -e "  ${C_YELLOW}${ICON_INFO} Server is running (pid $port_pid, port $PORT) [netstat]${C_RESET}"
      echo ""
      return 0
    fi
    echo -e "  ${C_RED}${ICON_ERR} Server is NOT running.${C_RESET}"
    echo ""
    return 1
  fi
}

status_short() {
  local port_pid
  port_pid=$(find_by_port)
  if [ -n "$port_pid" ]; then
    # On Windows, trust netstat even if kill -0 can't verify
    if is_win || pid_running "$port_pid"; then
      echo -e "${B_GREEN}RUNNING${C_RESET}  ${B_WHITE}http://localhost:$PORT${C_RESET}"
      return
    fi
  fi
  echo -e "${C_RED}STOPPED${C_RESET}"
}

menu() {
  while true; do
    clear
    echo -e "${B_MAGENTA}"
    echo "  ╔════════════════════════════════╗"
    echo "  ║        cc-viewer               ║"
    echo "  ╚════════════════════════════════╝"
    echo -e "${C_RESET}"
    echo -e "  $(status_short)"
    echo ""
    echo -e "  ${B_GREEN}1)${C_RESET} start"
    echo -e "  ${B_RED}2)${C_RESET} stop"
    echo -e "  ${B_YELLOW}3)${C_RESET} restart"
    echo -e "  ${C_DIM}0)${C_RESET} exit"
    echo ""
    echo -e "${C_DIM}──────────────────────────────────${C_RESET}"
    printf "  ${B_WHITE}Choice ›${C_RESET} "
    read -r choice
    case "$choice" in
      1) start ;;
      2) stop ;;
      3) stop; sleep 1; start ;;
      0) echo -e "${C_DIM}Bye.${C_RESET}"; exit 0 ;;
      *) echo -e "  ${B_RED}Invalid choice: $choice${C_RESET}"; sleep 1 ;;
    esac
  done
}

case "${1:-menu}" in
  start)   start ;;
  stop)    stop ;;
  restart)
    echo -e "${B_YELLOW}  Restarting cc-viewer server...${C_RESET}"
    echo ""
    stop
    sleep 1
    start
    ;;
  status)  status ;;
  menu)    menu ;;
  *)
    echo -e "${B_RED}Usage:${C_RESET} $0 ${C_CYAN}{start|stop|restart|status|menu}${C_RESET}"
    exit 1
    ;;
esac
