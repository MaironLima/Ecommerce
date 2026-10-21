FROM node:22-slim
# openssl: Prisma schema engine (migrate deploy)
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
# Full install: start/migrate rely on tsx, cross-env and prisma (devDependencies).
RUN npm ci
COPY . .

ENV NODE_ENV=production PORT=3002
EXPOSE 3002
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
