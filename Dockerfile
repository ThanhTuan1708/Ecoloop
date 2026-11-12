FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4174 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/artifacts ./artifacts
COPY --from=build /app/server ./server
COPY --from=build /app/config ./config
COPY package.json ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4174
CMD ["node", "server/start.mjs"]
