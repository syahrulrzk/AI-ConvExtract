FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

CMD ["npm", "start"]
