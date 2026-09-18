FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN chmod +x /app/entrypoint.sh
ENV PORT=3000
EXPOSE 3000 10000
CMD ["/app/entrypoint.sh"]
