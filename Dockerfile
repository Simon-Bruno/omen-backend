# Development Dockerfile with hot reloading
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install --package-lock-only
RUN npm ci

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
