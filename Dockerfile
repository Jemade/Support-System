# Multi-stage build for Avantis Customer Support Interface
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

# Copy production node_modules and application code
COPY --from=builder /app/node_modules ./node_modules
COPY client-ui/ ./

# Expose customer dashboard port
EXPOSE 9142

USER node
CMD ["node", "server.js"]
