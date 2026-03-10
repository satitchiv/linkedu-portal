#!/bin/bash
# LinkedU Parent Portal — start script
# Usage: ./start_portal.sh

PORTAL_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/portal.log"
PORT=8904

# Kill any existing instance
EXISTING=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "Stopping existing portal on port $PORT (PID $EXISTING)..."
  kill -9 $EXISTING 2>/dev/null
  sleep 1
fi

echo "Starting LinkedU Parent Portal on port $PORT..."
cd "$PORTAL_DIR"
nohup /usr/bin/python3 portal_server.py > "$LOG" 2>&1 &
PID=$!

sleep 2

# Verify
if curl -s --max-time 3 http://127.0.0.1:$PORT/ | grep -q "LINKEDU"; then
  echo "✅  Portal running — PID $PID"
  echo "    http://127.0.0.1:$PORT"
  echo "    Test: http://127.0.0.1:$PORT/portal/YIFJXNUR"
  echo "    Log: $LOG"
else
  echo "❌  Portal failed to start — check $LOG"
  cat "$LOG"
fi
