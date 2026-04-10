# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ghostscript \
    qpdf \
    ocrmypdf \
    unpaper \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-chi-sim \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=39010 \
    HOST=0.0.0.0

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --no-audit --no-fund

FROM base AS runtime
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

RUN install -d -o node -g node /app/data /tmp/z7pdf

USER node

EXPOSE 39010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('node:http');const req=http.get('http://127.0.0.1:'+(process.env.PORT||39010)+'/health',res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));"

CMD ["node", "src/server.js"]
