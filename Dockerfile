# Development Dockerfile with hot reloading
FROM node:20-bullseye-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install --package-lock-only --legacy-peer-deps
RUN npm ci --legacy-peer-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    fonts-freefont-ttf \
    udev

RUN npx playwright install chromium

# Copy source code and config files
COPY src/ ./src/
COPY tsconfig.json ./
COPY prisma/ ./prisma/

# Generate Prisma client (but don't build TypeScript)
RUN npm run db:generate

# Expose port
EXPOSE 3001

# Start the application in development mode with hot reloading
CMD ["npm", "run", "dev"]
