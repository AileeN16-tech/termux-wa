#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  Setup Bot WA All-in-One untuk Termux    "
echo "=========================================="

if command -v pkg >/dev/null 2>&1; then
    echo "[1/4] Memperbarui repositori Termux..."
    pkg update -y && pkg upgrade -y

    echo "[2/4] Menginstal Node.js, X11-repo, Chromium, FFmpeg, Python, dan Git..."
    pkg install -y x11-repo
    pkg install -y nodejs-lts chromium ffmpeg python git curl
else
    echo "[Info] Perintah 'pkg' tidak ditemukan. Melewati instalasi paket Termux."
fi

echo "[3/4] Menginstal / memperbarui yt-dlp..."
if command -v pip >/dev/null 2>&1; then
    pip install --upgrade yt-dlp || pip install --upgrade --break-system-packages yt-dlp
else
    echo "[Peringatan] pip tidak ditemukan. Pastikan python dan yt-dlp terinstal."
fi

echo "[4/4] Menginstal dependensi Node.js (tanpa download Chromium x86)..."
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install

chmod +x start.sh install.sh 2>/dev/null || true

echo ""
echo "=========================================="
echo "  Instalasi Selesai!                      "
echo "  Jalankan bot dengan: bash start.sh      "
echo "  Atau sekali jalan:   npm start          "
echo "=========================================="
