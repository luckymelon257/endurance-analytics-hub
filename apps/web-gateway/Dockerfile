# syntax=docker/dockerfile:1.7
# Build context is the repo root so the image can bundle shared/proto/.

FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY apps/web-gateway/package.json apps/web-gateway/package-lock.json ./
RUN npm ci

COPY apps/web-gateway/prisma ./prisma
RUN npx prisma generate

COPY apps/web-gateway/tsconfig.json apps/web-gateway/tsconfig.build.json apps/web-gateway/tsconfig.client.json apps/web-gateway/nest-cli.json ./
COPY apps/web-gateway/vite.config.ts apps/web-gateway/tailwind.config.ts apps/web-gateway/postcss.config.js ./
COPY apps/web-gateway/src ./src
COPY apps/web-gateway/views ./views
COPY apps/web-gateway/public ./public

RUN npm run build


FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY apps/web-gateway/package.json apps/web-gateway/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public

# Shared protobuf contracts (read at runtime by @grpc/proto-loader)
COPY shared/proto ./shared/proto

EXPOSE 3000
CMD ["node", "dist/main"]
