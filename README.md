# Bot WA All-in-One (Termux Android, Baileys)

Bot WhatsApp untuk mengunduh media publik (Instagram, TikTok, Facebook, X/Twitter, Threads, YouTube) dan membuat stiker dari gambar/video/GIF. Versi ini memakai **Baileys** (koneksi WebSocket langsung), jadi **tidak butuh Chromium** dan jauh lebih hemat RAM di HP.

## Instalasi
```bash
unzip bot-wa-termux.zip && cd bot-wa-termux
bash install.sh
```

## Login pertama (kode pairing, tanpa scan QR)
```bash
node index.js
```
Masukkan nomor WhatsApp bot (contoh `6281234567890`, awalan `0` otomatis jadi `62`). Lalu di HP:
**WhatsApp > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon saja**, dan masukkan kode 8 karakter yang tampil di Termux.

Alternatif tanpa prompt: `WA_NUMBER=6281234567890 node index.js`.
Alternatif QR (dipindai dari perangkat lain): `USE_QR=1 node index.js`.

Setelah berhasil login, hentikan dengan Ctrl+C lalu jalankan terus-menerus:
```bash
bash start.sh
```

## Cara pakai
- Kirim link IG / TikTok / FB / X / Threads -> bot mengirim medianya.
- Tambahkan kata `stiker` di pesan berisi link gambar untuk menjadikannya stiker.
- Kirim gambar / video / GIF -> bot membalas stiker.
- Kirim link YouTube -> balas `1` (video) atau `2` (mp3). `0` untuk batal.

## Troubleshooting
- Reset login: `npm run clean:session` lalu `node index.js`.
- Log detail koneksi: `DEBUG_BAILEYS=1 node index.js`.
- Unduhan gagal: `pip install -U yt-dlp`.
- Folder `auth_info/` berisi sesi login, jangan di-upload ke GitHub (sudah ada di `.gitignore`).
