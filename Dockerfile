# Multi-stage build for Google Drive Downloader
# Stage 1: Build TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY public ./public

# Build TypeScript (if needed for production)
# Note: We use tsx for development, so this is optional
# RUN npm run build

# Stage 2: Production image with Node.js + Python
FROM node:22-alpine

# Install Python and pip
RUN apk add --no-cache \
    python3 \
    py3-pip \
    && ln -sf python3 /usr/bin/python

# Install gdown
RUN pip3 install --no-cache-dir gdown

# Create app directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Install tsx for running TypeScript directly
RUN npm install -g tsx

# Copy application files from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/tsconfig.json ./

# Create directories for downloads and tasks
RUN mkdir -p /app/downloads /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["tsx", "src/index.ts"]

