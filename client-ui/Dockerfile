# Multi-stage Dockerfile for Avantis Hardware Support Client UI (Port 9142)

# Stage 1: Dependency Stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Slim Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=9142

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

EXPOSE 9142
USER node
CMD ["node", "server.js"]
