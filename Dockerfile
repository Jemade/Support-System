# Multi-stage Dockerfile for Avantis Hardware Support Dashboard (Port 9142)

# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY client-ui/package*.json ./
RUN npm ci --only=production

# Stage 2: Slim Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=9142

# Copy production node_modules and application files
COPY --from=builder /app/node_modules ./node_modules
COPY client-ui/ ./

# Expose customer dashboard port
EXPOSE 9142

USER node
CMD ["node", "server.js"]
