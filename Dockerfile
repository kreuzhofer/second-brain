# Frontend build stage
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm install

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Backend build stage
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy backend source code
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install git for simple-git operations and openssl for Prisma
RUN apk add --no-cache git openssl openssl-dev

# Copy backend package files
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install production dependencies only
RUN npm install --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy built backend files
COPY --from=backend-builder /app/dist ./dist

# Copy frontend dist for serving static files
COPY --from=frontend-builder /frontend/dist ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Run database migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
