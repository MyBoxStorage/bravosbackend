# Dockerfile for Fly.io - BRAVOS BRASIL Backend
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma for build
COPY prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy source code
COPY tsconfig.json ./
COPY index.ts ./
COPY routes ./routes
COPY utils ./utils
COPY services ./services
COPY integrations ./integrations
COPY config ./config
COPY types ./types

# Build TypeScript
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=10s --timeout=2s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["npm", "start"]
