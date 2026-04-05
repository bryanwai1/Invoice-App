FROM node:20-slim

# Only what's needed for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Use npm install (not ci) — tolerates lock file drift when packages are added
RUN npm install --omit=dev

COPY src/ ./src/

# Persistent dirs (mounted as volumes in docker-compose)
RUN mkdir -p data pdfs

EXPOSE 3001

CMD ["node", "src/index.js"]
