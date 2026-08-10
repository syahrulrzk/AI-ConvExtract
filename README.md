# AI Conversation Extractor

AI Conversation Extractor adalah microservice berbasis REST API (Fastify) dan Playwright untuk mengekstrak isi percakapan dari AI Share URL (seperti ChatGPT, Claude, dan Gemini) dan mengubahnya menjadi format JSON terstruktur yang siap digunakan oleh aplikasi lain.

Proyek ini *stateless* (tanpa database), dilengkapi dengan dashboard UI interaktif (React/Vite), mendukung batch processing, dan memiliki otentikasi menggunakan API Key.

## Fitur Utama

- **Share URL Extraction:** Mengekstrak teks dari ChatGPT, Claude, dan Gemini Share links.
- **Platform Detection:** Mendeteksi otomatis platform asal URL.
- **Batch Processing:** Mengekstrak banyak URL sekaligus secara konkuren.
- **Statistics Engine:** Menghitung jumlah pesan, prompt user, kata, dan karakter.
- **Security:** Dilindungi oleh API Key.
- **Dashboard UI:** Antarmuka web modern dengan fitur *Dark Mode*, *Glassmorphism*, dan *Raw JSON viewer*.
- **Memory Efficient:** Menggunakan *Singleton Browser Manager* untuk memakai ulang (reuse) instance Playwright Chromium.

## Prasyarat

Pastikan mesin Anda memiliki:
- Node.js versi 20+ atau 22 LTS
- NPM / Yarn
- Browser Playwright dependencies

## Instalasi (Local Development)

1. Clone repositori ini (atau buka di direktori project).
2. Install semua dependensi untuk backend dan frontend:
   ```bash
   npm install
   cd frontend && npm install && npm run build
   cd ..
   ```
3. Install Chromium browser untuk Playwright:
   ```bash
   npx playwright install chromium
   ```
4. Copy file environment dan atur API Key Anda:
   ```bash
   cp .env.example .env
   ```
   *(Secara bawaan, API key adalah `ai-converter-secret-key-123`)*
5. Jalankan server backend (dengan hot-reload):
   ```bash
   npm run dev
   ```

Aplikasi dan Dashboard kini bisa diakses melalui `http://localhost:3100` (atau IP mesin Anda).

## Deployment (Docker)

Aplikasi ini sepenuhnya siap di-deploy secara stateless menggunakan Docker.

```bash
docker-compose up -d --build
```
Aplikasi akan berjalan di port `3100`.

## Dokumentasi API

### 1. Ekstrak Single URL
**Endpoint:** `POST /api/v1/extract`

**Headers:**
- `Content-Type: application/json`
- `x-api-key: [YOUR_API_KEY]`

**Body:**
```json
{
  "url": "https://chatgpt.com/share/xxxxxx"
}
```

### 2. Ekstrak Multi URL (Batch)
**Endpoint:** `POST /api/v1/extract/batch`

**Headers:**
- `Content-Type: application/json`
- `x-api-key: [YOUR_API_KEY]`

**Body:**
```json
{
  "urls": [
    "https://chatgpt.com/share/xxxxxx",
    "https://claude.ai/share/yyyyyy"
  ]
}
```

### 3. Cek Status Server (Health)
**Endpoint:** `GET /health`

---
*Dibuat berdasarkan spesifikasi PRD v1.3*
# AI-ConvExtract
