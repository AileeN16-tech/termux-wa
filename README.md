# Bot WA All-in-One (Versi Termux Android)

Bot WhatsApp berbasis `whatsapp-web.js` untuk mengunduh media publik (Instagram, TikTok, Facebook, X/Twitter, Threads, YouTube) serta membuat stiker otomatis dari gambar/video/GIF. Sudah dioptimalkan khusus agar berjalan stabil menggunakan Chromium bawaan Termux Android.

## Struktur File
- `index.js` — Kode utama bot dengan konfigurasi Puppeteer, Chromium, FFmpeg, dan `yt-dlp` khusus Termux.
- `package.json` — Daftar dependensi Node.js dan perintah cepat (`npm start`).
- `.npmrc` — Mencegah Puppeteer mengunduh Chromium versi PC (x86_64) saat `npm install`.
- `.gitignore` — Mencegah folder rahasia (`.wwebjs_auth/`) dan folder besar (`node_modules/`) ikut ter-upload ke GitHub.
- `install.sh` — Script instalasi otomatis semua paket yang dibutuhkan di Termux.
- `start.sh` — Script untuk menjalankan bot dengan pengecekan internet, `termux-wake-lock`, pembersihan proses Chromium, dan *auto-restart*.

---

## Cara Instalasi & Menjalankan di Termux

1. **Clone repositori dari GitHub:**
   ```bash
   pkg install git -y
   git clone https://github.com/USERNAME_ANDA/NAMA_REPO_ANDA.git
   cd NAMA_REPO_ANDA
   ```

2. **Jalankan installer otomatis:**
   ```bash
   bash install.sh
   ```

3. **Jalankan Bot:**
   - Dengan *auto-restart* & *wake-lock* (disarankan):
     ```bash
     bash start.sh
     ```
   - Atau jalankan langsung satu kali:
     ```bash
     npm start
     ```
   - Scan **QR Code** yang muncul di layar Termux lewat **WhatsApp > Perangkat Tertaut**.

---

## Cara Upload Proyek Ini ke GitHub dari Termux

1. Ekstrak file `.zip` lalu masuk ke foldernya:
   ```bash
   unzip bot-wa-termux.zip
   cd bot-wa-termux
   ```
2. Inisialisasi Git dan kirim ke repositori GitHub Anda:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Bot WA Termux ready"
   git branch -M main
   git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO_ANDA.git
   git push -u origin main
   ```

---

## Troubleshooting Cepat
- **Ingin reset login / QR Code tidak muncul:**
  ```bash
  npm run clean:session
  ```
- **Ingin melihat log detail Chromium saat terjadi error:**
  ```bash
  DEBUG_CHROME=1 node index.js
  ```
