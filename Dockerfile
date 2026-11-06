FROM ghcr.io/pnpm/pnpm:alpine AS base
RUN pnpm runtime set node lts --global
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS prod-deps
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store
COPY . .
RUN NEURON404_DATA_DIR=/tmp/neuron404-build pnpm build

FROM node:lts-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NEURON404_DATA_DIR=/data
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
COPY drizzle ./drizzle
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
