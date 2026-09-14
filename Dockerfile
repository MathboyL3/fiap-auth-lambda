# Servidor de autenticação (Bun) para deploy em nuvem (Railway).
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* package-lock.json* ./
# instala apenas as deps de runtime (pg, jsonwebtoken)
RUN bun install --production

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# Railway injeta PORT; o servidor escuta nela (fallback 3000)
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
