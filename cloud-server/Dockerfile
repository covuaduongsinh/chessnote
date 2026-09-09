# ChessNote Cloud — chạy trực tiếp qua `tsx` (không build bước riêng), giống
# cách ai-sidecar/ chạy. Ảnh nhỏ, ít tầng, phù hợp tự host trên 1 VPS nhỏ.
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
# `tsx`/`typescript` là devDependencies nhưng CẦN LÚC CHẠY THẬT (không có
# bước build riêng — chạy trực tiếp .ts qua tsx, giống ai-sidecar/) nên
# KHÔNG dùng --omit=dev ở đây.
RUN npm install

COPY src ./src
COPY tsconfig.json ./

ENV CHESSNOTE_CLOUD_PORT=8080
ENV CHESSNOTE_CLOUD_DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
