FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package*.json ./
RUN npm install --omit=dev
COPY dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
