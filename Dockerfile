# Сборка для хостинга с Docker (например, Timeweb Cloud App Platform → Dockerfile).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app ./
EXPOSE 8080
CMD ["npm", "start"]
