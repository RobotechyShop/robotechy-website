# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY order-service/package*.json ./order-service/

# Install dependencies
RUN npm ci
RUN cd order-service && npm ci

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install serve for static file hosting
RUN npm install -g serve

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy order service
COPY --from=builder /app/order-service ./order-service

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose ports (frontend: 3000, order service doesn't need a port - it connects outbound to relays)
EXPOSE 3000

# Environment variables (to be provided at runtime)
ENV NODE_ENV=production

ENTRYPOINT ["/docker-entrypoint.sh"]
