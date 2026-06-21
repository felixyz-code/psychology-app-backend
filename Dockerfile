FROM node:20-bookworm-slim

WORKDIR /app

ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json tsconfig.seed.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node dist/main"]
