# Dockerfile for Nuxt application generated by nuxfly
FROM node:22-slim
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get -y update && apt-get install -y sqlite3 curl ca-certificates

# Install Litestream
RUN curl -L https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz | tar -xz -C /usr/local/bin

# Install drizzle CLI and copy migrations
COPY .nuxfly/package.json /app/dist/db/package.json
COPY .nuxfly/package-lock.json /app/dist/db/package-lock.json
COPY .nuxfly/drizzle.config.ts /app/dist/db/drizzle.config.ts
COPY .nuxfly/drizzle /app/dist/db/drizzle
RUN cd /app/dist/db && npm install

# Copy app files (assume already built)
COPY .nuxfly/.output/server /app/dist
COPY .nuxfly/.output/public /app/public

# Copy Litestream configuration and startup script
COPY .nuxfly/litestream.yml /etc/litestream.yml
COPY .nuxfly/start.sh /start.sh
RUN mkdir -p /data && chmod +x /start.sh

WORKDIR /app
EXPOSE 3000
ENV NODE_ENV=production

# This is overridden in fly.toml to use /start.sh to enable Litestream continuous backup
CMD ["/start.sh"]
