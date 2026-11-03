#!/usr/bin/env bash
cd "$(dirname "$0")"
python3 serve.py &
SERVER_PID=$!

sleep 1
if which google-chrome > /dev/null; then
    google-chrome "http://localhost:8060/TinySwords.html" &
elif which xdg-open > /dev/null; then
    xdg-open "http://localhost:8060/TinySwords.html" &
fi

wait $SERVER_PID
