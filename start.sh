#!/usr/bin/env bash

if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
fi

trap 'command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock; exit 0' SIGINT SIGTERM

while true; do
    echo "[Bot WA] Menjalankan bot..."
    node index.js
    echo "[Bot WA] Berhenti. Restart dalam 5 detik... (Ctrl+C untuk stop)"
    sleep 5
done
