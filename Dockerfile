# syntax=docker/dockerfile:1

# ---- Stage 1: build the frontend (Vite) ----
# frontend/dist is gitignored, so it must be built inside the image
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime ----
# IMPORTANT: this base image version MUST match the `playwright` version in
# package.json. The image ships preinstalled browsers at /ms-playwright, so
# matching versions means no browser download and a working extract feature.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3100 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Use the frontend build produced in stage 1 (frontend/dist is excluded from the build context)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 3100

CMD ["npm", "start"]
