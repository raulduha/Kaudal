FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run typecheck && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -S kaudal && adduser -S kaudal -G kaudal
COPY --from=builder --chown=kaudal:kaudal /app/.next/standalone ./
COPY --from=builder --chown=kaudal:kaudal /app/.next/static ./.next/static
USER kaudal
EXPOSE 3000
CMD ["node", "server.js"]
