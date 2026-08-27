# StudyMate backend — Node 20
FROM node:20-alpine

WORKDIR /app/backend

# Install dependencies first (better layer caching)
COPY backend/package.json ./
RUN npm install --omit=dev

# Copy application source
COPY backend/ ./

# The database lives in a volume; uploads too.
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0
# Base source storage dir under the backend workdir
ENV DATA_DIR=/app/backend/data

# Volumes for runtime data (mount via docker-compose)
VOLUME ["/app/backend/data", "/app/backend/uploads"]

# Healthcheck against the liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:5000/api/health >/dev/null 2>&1 || exit 1

EXPOSE 5000

# JWT_SECRET must be provided at runtime (compose sets it).
CMD ["sh", "-c", "node scripts/migrate.js && node index.js"]
