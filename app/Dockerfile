# Production static shell for the Vite app. Built from repo root context:
#   docker build -f app/Dockerfile -t shadowline-web .
#
# VITE_API_URL is baked in at build time (same-origin empty string is fine when
# host nginx proxies /api to the Go service).

FROM node:22-bookworm AS build
WORKDIR /src
COPY app/package.json app/yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile
COPY app/ ./
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN yarn build

FROM nginx:1.27-alpine
COPY ops/nginx/app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
