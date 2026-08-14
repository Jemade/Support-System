# Stage 1: Dependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=9143

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 9143
USER node
CMD ["node", "server.js"]
