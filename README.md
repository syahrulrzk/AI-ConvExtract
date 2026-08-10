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

**Alur Rekomendasi (Sesuai Gambar):**
1. **Trigger:** `Execute workflow` / Jadwal.
2. **Data Source:** Baca link (URL) percakapan AI dari Google Sheets / Database.
3. **Filter (If):** Cek apakah URL valid.
4. **Ekstraksi (HTTP Request):** Kirim POST Request ke AI-ConvExtract (seperti JSON di atas).
5. **AI Agent Processing (Groq/Llama):** Gunakan hasil teks ekstrak untuk diringkas/dianalisa oleh AI Agent.
6. **Save Result:** Update atau tambah baris di Google Sheets dengan hasil akhir.
