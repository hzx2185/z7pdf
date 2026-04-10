FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ghostscript qpdf curl ocrmypdf unpaper tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY server.js ./server.js
COPY db.js ./db.js
COPY utils ./utils
COPY services ./services
COPY middleware ./middleware
COPY routes ./routes

ENV PORT=39010
ENV HOST=0.0.0.0

EXPOSE 39010

CMD ["npm", "start"]
