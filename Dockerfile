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
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY public ./public
COPY server.js ./server.js
COPY db.js ./db.js
COPY utils ./utils
COPY services ./services
COPY middleware ./middleware
COPY routes ./routes

RUN mkdir -p /app/data /tmp/z7pdf \
  && chown -R node:node /app /tmp/z7pdf

USER node

EXPOSE 39010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('node:http');const req=http.get('http://127.0.0.1:'+(process.env.PORT||39010)+'/health',res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));"

CMD ["npm", "start"]
