# Production static shell for both front ends. Built from repo root context:
#   docker build -f app/Dockerfile -t shadowline-web .
#
# Two builds in one image: the learner app at / and the admin console at /admin/.
# One image because they are one origin — the session cookie has no Domain and the
# API allows exactly one CORS origin, so the console being served beside the app
# is what makes signing in work with no server change at all.
#
# VITE_API_URL is baked in at build time (same-origin empty string is fine when
# host nginx proxies /api to the Go service). The console needs no such setting:
# it always calls its own origin, which nginx proxies.

FROM node:22-bookworm AS app
WORKDIR /src
COPY app/package.json app/yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile
COPY app/ ./
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN yarn build

FROM node:22-bookworm AS console
WORKDIR /src
COPY app-admin/package.json app-admin/package-lock.json ./
RUN npm ci
COPY app-admin/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY ops/nginx/app.conf /etc/nginx/conf.d/default.conf
COPY --from=app /src/dist /usr/share/nginx/html
COPY --from=console /src/dist /usr/share/nginx/html/admin
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
