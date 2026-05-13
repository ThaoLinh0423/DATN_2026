FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose ports
EXPOSE 5173 4173

# Default command
CMD ["npm", "run", "dev"]