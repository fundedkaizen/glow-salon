#!/usr/bin/env bash
# Wait until window.__playing is false in the glow1 session (max ~150 s).
for i in $(seq 1 75); do
  r=$(timeout 20 npx agent-browser --session glow1 eval "String(window.__playing)" 2>/dev/null | tail -1)
  [ "$r" = '"false"' ] && exit 0
  sleep 2
done
exit 1
