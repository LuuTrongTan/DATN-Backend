FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Cài tất cả dependencies và devDependencies
RUN npm install

# Cài typescript CLI
RUN npm install -g typescript

# Copy toàn bộ source code vào container
COPY . .

RUN rm -rf dist

# Build TypeScript
RUN npm run build

RUN find dist -type d | sort

# Expose port (default 3000, can be overridden via APP_PORT env var)
EXPOSE 3000

CMD ["npm", "start"]
