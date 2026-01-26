# Frontend build stage
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY ../frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY ../frontend/ ./

# Build frontend
RUN npm run build

# Backend build stage
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install git for simple-git operations
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy built files from builder
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
