FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN rm -rf node_modules && npm ci
RUN npm run build:css
RUN npm run build
RUN mkdir -p /app/data
ENV PORT=3000
ENV DB_PATH=/app/data/gastando.db
EXPOSE 3000
CMD ["node", "dist/server.js"]
