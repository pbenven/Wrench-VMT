FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy app files
COPY index.js ./
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "index.js"]