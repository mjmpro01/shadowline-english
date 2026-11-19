FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -o /out/seed ./cmd/seed \
 && CGO_ENABLED=0 go build -trimpath -o /out/importer ./cmd/importer \
 && CGO_ENABLED=0 go build -trimpath -o /out/notifier ./cmd/notifier \
 && CGO_ENABLED=0 go build -trimpath -o /out/vapid ./cmd/vapid

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
COPY --from=build /out/api /usr/local/bin/api
COPY --from=build /out/seed /usr/local/bin/seed
COPY --from=build /out/importer /usr/local/bin/importer
COPY --from=build /out/notifier /usr/local/bin/notifier
COPY --from=build /out/vapid /usr/local/bin/vapid
USER app
# Which code this image is, for the console's System page. Last, so a new
# commit does not throw away the layers above it.
ARG SHADOWLINE_VERSION=
ENV SHADOWLINE_VERSION=${SHADOWLINE_VERSION}
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/api"]
