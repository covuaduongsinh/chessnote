# ChessNote AI Sidecar — chạy qua `tsx` để xử lý các yêu cầu AI và Claude API.
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./

ENV AI_SIDECAR_PORT=3457
EXPOSE 3457

CMD ["npx", "tsx", "src/server.ts"]
