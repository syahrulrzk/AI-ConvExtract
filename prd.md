Product Requirements Document (PRD)
AI Conversation Extractor

Version: 1.0.0

Status: Draft

Project Type: Internal Microservice

Architecture: Stateless REST API

1. Project Overview
Description

AI Conversation Extractor adalah microservice berbasis REST API yang bertugas mengekstrak isi percakapan dari AI Share URL (ChatGPT, Claude, Gemini, dan platform AI lainnya) kemudian mengubahnya menjadi JSON terstruktur yang siap digunakan oleh aplikasi lain.

Service ini tidak memiliki database, tidak menyimpan data, dan seluruh proses dilakukan secara in-memory.

2. Objectives
Mengekstrak percakapan AI dari Share URL.
Mengubah percakapan menjadi JSON terstruktur.
Menghitung statistik percakapan.
Menyediakan API yang ringan, cepat, dan mudah diintegrasikan.
Mendukung banyak platform AI melalui arsitektur modular.
3. Scope
In Scope
REST API
Share URL Extraction
Platform Detection
Browser Automation
Conversation Parsing
Prompt Counting
Summary Input Builder
Statistics Generation
Docker Deployment
Swagger Documentation
Out of Scope
User Authentication System
Dashboard
Database
User Management
AI Summary Generation
Workflow Automation
Scheduling
4. Core Philosophy

AI Conversation Extractor merupakan stateless processing engine.

Service hanya menerima request, memproses data menggunakan browser automation, kemudian langsung mengembalikan hasil dalam bentuk JSON.

Tidak ada data yang disimpan di database maupun filesystem (kecuali log aplikasi jika diaktifkan).

5. Technology Stack
Layer	Technology
Runtime	Node.js 22 LTS
Framework	Fastify
Browser Engine	Playwright
Browser	Chromium
Language	JavaScript (ES Modules)
Validation	Zod
Logger	Pino
Documentation	Swagger/OpenAPI
Deployment	Docker
6. System Architecture
                 REST Client
                      │
                      ▼
          AI Conversation Extractor API
      ┌─────────────────────────────────┐
      │          Fastify Server         │
      ├─────────────────────────────────┤
      │ Platform Detector               │
      │ Browser Manager                 │
      │ Extractor Engine                │
      │ Parser Engine                   │
      │ Statistics Engine               │
      │ Response Builder                │
      └─────────────────────────────────┘
                      │
                      ▼
              Playwright Chromium
                      │
                      ▼
     ChatGPT / Claude / Gemini / Others
7. Processing Flow
HTTP Request

↓

Validate Request

↓

Detect Platform

↓

Acquire Browser

↓

Open Share URL

↓

Wait Until Ready

↓

Extract DOM

↓

Parse Conversation

↓

Normalize Messages

↓

Generate Statistics

↓

Build Response

↓

Return JSON
8. Functional Requirements
ID	Requirement	Priority
FR-001	Detect AI platform from URL	High
FR-002	Open browser using Playwright	High
FR-003	Open AI Share URL	High
FR-004	Wait until page fully rendered	High
FR-005	Extract conversation	High
FR-006	Parse user messages	High
FR-007	Parse assistant messages	High
FR-008	Count prompts	High
FR-009	Generate statistics	High
FR-010	Return normalized JSON	High
FR-011	Health Check Endpoint	High
FR-012	Version Endpoint	Medium
FR-013	Swagger Documentation	Medium
9. Non Functional Requirements
Requirement	Target
Response Time	< 10 seconds
Availability	≥ 99%
Stateless	Yes
Docker Ready	Yes
Browser Reuse	Yes
Modular Design	Yes
Memory Efficient	Yes
Platform Extensible	Yes
10. Supported Platforms
Platform	Status
ChatGPT	Supported
Claude	Supported
Gemini	Supported
Grok	Planned
DeepSeek	Planned
Perplexity	Planned
11. API Endpoints
Method	Endpoint	Description
GET	/health	Health Check
GET	/version	Application Version
GET	/docs	Swagger Documentation
POST	/api/v1/extract	Extract Single Conversation
POST	/api/v1/extract/batch	Extract Multiple Conversations
12. Request Example
{
  "url": "https://chatgpt.com/share/xxxxxxxx"
}
13. Response Example
{
  "success": true,
  "platform": "chatgpt",
  "title": "Conversation Title",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant",
      "content": "Hi!"
    }
  ],
  "promptCount": 1,
  "assistantCount": 1,
  "totalMessages": 2,
  "summaryInput": "Hello",
  "wordCount": 120,
  "characterCount": 840,
  "processingTime": 950
}
14. Error Response
{
  "success": false,
  "platform": "chatgpt",
  "error": {
    "code": "EXTRACTION_FAILED",
    "message": "Conversation could not be extracted."
  }
}
15. Core Modules
Module	Responsibility
Platform Detector	Detect AI platform
Browser Manager	Manage Playwright browser lifecycle
Extractor Engine	Retrieve rendered page
Parser Engine	Parse conversation into structured messages
Statistics Engine	Calculate metrics
Response Builder	Build standardized API response
16. Folder Structure
ai-conversation-extractor/
│
├── docs/
├── src/
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── schemas/
│   ├── services/
│   │   ├── browser/
│   │   ├── extractor/
│   │   ├── parser/
│   │   └── statistics/
│   ├── utils/
│   ├── app.js
│   └── server.js
│
├── tests/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── README.md
└── .env.example
17. Security
API Key Authentication
Helmet
CORS
Rate Limiting
URL Validation
Input Validation (Zod)
Centralized Error Handling
18. Logging

Setiap request dicatat dengan:

Timestamp
Platform
URL (opsional, bisa dimasking untuk privasi)
Processing Time
Status
Error (jika ada)
19. Deployment
Docker
Single Container
Stateless
Tanpa Database
Tanpa Redis
Siap dijalankan di Docker Compose, Docker Swarm, atau Kubernetes
20. Roadmap
Version	Feature
v1.0	ChatGPT Extractor
v1.1	Claude Extractor
v1.2	Gemini Extractor
v1.3	Batch Processing
v1.4	PDF & Markdown Export
v2.0	OCR Support
v2.1	Sensitive Data Detection
v3.0	AI Governance SDK