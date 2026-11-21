# Bot WA Simpel untuk Termux (Tanpa Chromium)

Versi ringan berbasis **Baileys** — langsung jalan di Termux Play Store maupun F-Droid tanpa perlu install Chromium/Xvfb.

## Cara Pakai (Cuma 2 Perintah)
```bash
bash install.sh
bash start.sh
```

## Login Tanpa Scan QR (Pakai 1 HP Saja)
Ganti angka dengan nomor WA Anda (awalan `62`):
```bash
PHONE=6281234567890 node index.js
```
Masukkan kode 8 digit yang muncul ke **WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon saja**. Setelah tersambung, selanjutnya cukup jalankan `bash start.sh`.

## Reset Login
```bash
npm run reset
```
