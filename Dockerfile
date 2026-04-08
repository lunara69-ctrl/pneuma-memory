FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Utwórz katalog na bazę danych
RUN mkdir -p data memory-git

EXPOSE 3333

CMD ["node", "server.js"]
