FROM ghcr.io/pnpm/pnpm:12.16.1 AS base
RUN pnpm runtime set node 24.20.0 --global
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS production-dependencies
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store
COPY . .
RUN NEURON404_DATA_DIR=/tmp/neuron404-build pnpm build

FROM node:24.20.0-trixie-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NEURON404_DATA_DIR=/data
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY src/lib ./src/lib
COPY scripts ./scripts
COPY bin ./bin
COPY drizzle ./drizzle
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
