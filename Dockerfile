# Development Dockerfile with hot reloading
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code and config files
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY tsconfig.json ./
COPY prisma/ ./prisma/

# Generate Prisma client (but don't build TypeScript)
RUN npm run db:generate

# Expose port
EXPOSE 3000

# Start the application in development mode with hot reloading
CMD ["npm", "run", "dev"]
