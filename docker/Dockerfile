FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (sử dụng biến môi trường PORT, mặc định 3000)
ARG PORT=3000
ENV PORT=${PORT}
EXPOSE ${PORT}

# Run migrations and start server
CMD sh -c "npm run migrate && npm start"

