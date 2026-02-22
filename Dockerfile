# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

USER nodejs

EXPOSE 3000

# Si /health existe y devuelve 200, dejalo. Si no existe, borralo o cambiá la ruta.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "const http=require('http');http.get('http://127.0.0.1:3000/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error'>

CMD ["node", "dist/main.js"]
