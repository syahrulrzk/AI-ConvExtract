# AI Conversation Extractor

AI Conversation Extractor adalah microservice berbasis REST API (Fastify) untuk mengekstrak isi percakapan dari AI Share URL (seperti ChatGPT, Claude, dan Gemini) dan mengubahnya menjadi format JSON terstruktur yang siap digunakan oleh aplikasi lain.

Ekstraksi berjalan secara **asynchronous (job queue)** dengan Redis + BullMQ — request langsung dibalas `jobId`, hasil diambil lewat polling. Ini membuat percakapan **sangat panjang (ratusan prompt)** tetap bisa diekstrak lengkap tanpa timeout HTTP, karena proses berat berjalan di background worker.

## Fitur Utama

- **Share URL Extraction:** Mengekstrak teks dari ChatGPT, Claude, dan Gemini Share links.
- **Async Job Queue:** Redis + BullMQ — submit instan, hasil via polling (`GET /extract/jobs/:id`). Job persisten walau server restart, tahan hingga **1 jam**.
- **Dual-Engine Extraction (ChatGPT):** Playwright **dan** Puppeteer dijalankan paralel, hasil terlengkap yang dipakai (anti-variance lazy-render).
- **Long Conversation Handling:** Halaman share ChatGPT bersifat *virtualized* — collector otomatis scroll bertahap (adaptive + recovery pass), me-render & menggabungkan seluruh pesan sampai habis. Budget waktu **scaling otomatis** sesuai panjang percakapan.
- **Attachment Detection:** Upload gambar terdeteksi (`attachments: ["image"]`) + badge di UI.
- **Statistics Engine:** Menghitung jumlah pesan, prompt user, kata, karakter, dan waktu proses (format manusiawi `2m 8s`).
- **Batch Processing:** Mengekstrak banyak URL sekaligus — tiap URL dapat `jobId` sendiri.
- **Security:** Dilindungi oleh API Key.
- **Dashboard UI:** Antarmuka web modern (React/Vite) dengan polling status job, *Dark Mode*, *Glassmorphism*, dan *Raw JSON viewer*.
- **Memory Efficient:** Menggunakan *Singleton Browser Manager* untuk memakai ulang (reuse) instance Chromium.

## Arsitektur

```
User ──POST /api/v1/extract──▶ Server ──▶ Redis (BullMQ Queue)
                                      │
                          Response CEPAT: { jobId }  ◀── gak nunggu ekstraksi!
                                      ▼
                              Worker (background)
                                      │
                    Playwright ──┐     │
                    Puppeteer  ──┴─▶   pilih hasil terlengkap
                                      ▼
                              Redis (hasil job)
                                      │
User ──GET /api/v1/extract/jobs/:id──▶ { status: "done", result: {...} }
```

## Prasyarat

- Node.js versi 20+ atau 22 LTS
- NPM / Yarn
- **Docker** (untuk Redis — wajib, queue memakai Redis)
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
5. Jalankan Redis (via Docker):
   ```bash
   docker compose up -d redis
   ```
6. Jalankan server backend (dengan hot-reload):
   ```bash
   npm run dev
   ```

Aplikasi dan Dashboard kini bisa diakses melalui `http://localhost:3100` (atau IP mesin Anda).

## Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| `PORT` | `3100` | Port server |
| `API_KEY` | `ai-converter-secret-key-123` | API key untuk otentikasi |
| `REDIS_URL` | `redis://localhost:6379` | Koneksi Redis untuk job queue |
| `APP_VERSION` | `V.0.1` | Versi aplikasi yang ditampilkan di footer dashboard (bisa diubah per deployment) |
| `EXTRACT_JOB_TIMEOUT_MS` | `3600000` (1 jam) | Batas maksimal waktu satu job sebelum di-abort (jaring pengaman anti-hang) |
| `EXTRACT_COLLECT_TIMEOUT_MS` | `120000` (2 menit) | Budget dasar collection per halaman |
| `EXTRACT_COLLECT_MAX_TIMEOUT_MS` | `3000000` (50 menit) | Ceiling budget collection — scaling otomatis dengan panjang percakapan |

> **Catatan:** Collection budget otomatis naik seiring panjang percakapan (dihitung dari tinggi konten halaman), jadi percakapan ratusan prompt tidak terpotong — tetap di bawah job timeout 1 jam.

## Deployment (Docker)

Aplikasi siap di-deploy bersama Redis menggunakan Docker Compose.

### Bagaimana alur deployment sekarang?

**Build dilakukan otomatis oleh GitHub Actions** setiap ada push ke `main` — image di-push ke **GHCR** (`ghcr.io/syahrulrzk/ai-convextract:latest`). Server cukup **pull** image yang sudah jadi, **tidak perlu build ulang** (dan tidak perlu `--build`).

```
Push ke main ──▶ GitHub Actions build image ──▶ push ke GHCR
                                                      │
                                                      ▼
Server: git pull ──▶ docker compose pull ──▶ docker compose up -d
```

### Deploy di server (cara yang benar — disarankan)

```bash
cd /path/to/project

git pull                 # 1. tarik code terbaru (docker-compose.yml, dll)
docker compose pull      # 2. tarik image jadi dari GHCR (TIDAK build lokal)
docker compose up -d     # 3. start redis + app (app tunggu redis healthy)
```

> **PENTING:** Jangan pakai `docker compose up -d --build` di server! Build lokal butuh akses ke `mcr.microsoft.com` (base image Playwright) yang sering **diblokir/putus** di server tertentu — pakai `pull` saja karena image sudah dibuild di GitHub.

> **PENTING:** `docker compose up -d` saja **tidak** mengambil image baru kalau image lama sudah ada di server — **selalu `docker compose pull` dulu**. Image CI mendukung `linux/amd64` dan `linux/arm64`.

> **Catatan:** Agar server bisa pull tanpa login, buat package GHCR menjadi **public** (buka halaman Packages repo → package settings → *Danger Zone* → *Change visibility* → **Public**). Untuk rollback ke versi tertentu: `docker compose pull` lalu set `image: ghcr.io/syahrulrzk/ai-convextract:sha-<short-sha>` di `docker-compose.yml`.

### Build langsung dari source (opsi cadangan — local development)

Kalau mau build image sendiri (misal di mesin lokal yang punya akses ke `mcr.microsoft.com`):

```bash
docker compose up -d --build
```

Ini otomatis menjalankan **Redis** + **app** (app menunggu Redis healthy). Aplikasi berjalan di port `3100`.

> **Catatan:** Base image Docker (`mcr.microsoft.com/playwright`) **harus sama versinya** dengan `playwright` di `package.json` (saat ini `1.62.1`). Jika versi diubah, update juga `FROM` di `Dockerfile` agar browser di image cocok.

## Dokumentasi API

### 1. Submit Ekstraksi (Single URL) — Async
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

**Response (202 Accepted) — instan, tidak menunggu ekstraksi:**
```json
{
  "success": true,
  "jobId": "4f1e2a3b-...",
  "status": "queued",
  "url": "https://chatgpt.com/share/xxxxxx",
  "pollUrl": "/api/v1/extract/jobs/4f1e2a3b-..."
}
```

### 2. Polling Status Job
**Endpoint:** `GET /api/v1/extract/jobs/:jobId`

**Headers:** `x-api-key: [YOUR_API_KEY]`

**Response:**
```json
{
  "success": true,
  "jobId": "4f1e2a3b-...",
  "status": "running",
  "url": "https://chatgpt.com/share/xxxxxx"
}
```

Status: `queued` → `running` → `done` (atau `failed`). Saat `done`, response menyertakan `result`:
```json
{
  "success": true,
  "jobId": "4f1e2a3b-...",
  "status": "done",
  "result": {
    "success": true,
    "url": "https://chatgpt.com/share/xxxxxx",
    "platform": "chatgpt",
    "title": "Judul Percakapan",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "...", "attachments": ["image"] }
    ],
    "promptCount": 59,
    "assistantCount": 59,
    "totalMessages": 118,
    "wordCount": 9897,
    "characterCount": 80337,
    "processingTime": 127580,
    "processingTimeLabel": "2m 8s",
    "truncated": false
  }
}
```

> **Catatan:** `truncated: true` berarti percakapan sangat panjang dan melewati batas waktu collection — sebagian pesan terakhir mungkin tidak terambil (UI menampilkan peringatan).

### 3. Ekstrak Multi URL (Batch)
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

**Response (202):** tiap URL mendapat `jobId` sendiri + `pollUrl`.

### 4. Cek Status Server (Health)
**Endpoint:** `GET /health`

---
*Dibuat berdasarkan spesifikasi PRD v1.3*

## Integrasi dengan n8n (Workflow Automation)

Microservice ini sangat cocok digabungkan dengan **n8n** (seperti yang terlihat pada arsitektur workflow di atas). Anda bisa menggunakan Node `HTTP Request` untuk memanggil API AI-ConvExtract.

### Contoh JSON Node n8n (HTTP Request)

Copy JSON di bawah ini dan paste langsung ke canvas n8n Anda untuk membuat HTTP Request Node yang sudah terkonfigurasi ke API ini:

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "http://172.16.19.235:3100/api/v1/extract",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "ai-converter-secret-key-123"
            },
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{\n  \"url\": \"{{ $json.url }}\"\n}",
        "options": {}
      },
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Extract AI URL",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [
        820,
        300
      ]
    }
  ],
  "connections": {}
}
```

> **Untuk n8n:** karena ekstraksi async, ambil `jobId` dari response lalu polling `GET /api/v1/extract/jobs/:jobId` (misal dengan `Wait` node tiap 2-5 detik) sampai `status: "done"`, baru lanjut ke AI Agent processing.

**Alur Rekomendasi (Sesuai Gambar):**
1. **Trigger:** `Execute workflow` / Jadwal.
2. **Data Source:** Baca link (URL) percakapan AI dari Google Sheets / Database.
3. **Filter (If):** Cek apakah URL valid.
4. **Ekstraksi (HTTP Request):** Kirim POST Request ke AI-ConvExtract (seperti JSON di atas), lalu polling status job sampai `done`.
5. **AI Agent Processing (Groq/Llama):** Gunakan hasil teks ekstrak untuk diringkas/dianalisa oleh AI Agent.
6. **Save Result:** Update atau tambah baris di Google Sheets dengan hasil akhir.
