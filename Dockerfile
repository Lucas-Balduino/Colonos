FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=43123
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src ./src
EXPOSE 43123
CMD ["npx", "tsx", "src/server/index.ts"]
