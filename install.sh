#!/usr/bin/env bash
set -e

echo "=== Install Bot WA Simpel (Tanpa Chromium) ==="
pkg update -y
pkg install -y nodejs-lts ffmpeg python git
pip install -U yt-dlp || pip install -U --break-system-packages yt-dlp
npm install --omit=optional
chmod +x start.sh

echo ""
echo "SELESAI! Jalankan bot dengan:"
echo "  bash start.sh"
echo "Atau login pakai nomor HP (tanpa scan QR):"
echo "  PHONE=6281234567890 node index.js"
