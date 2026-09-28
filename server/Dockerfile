FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -o /out/seed ./cmd/seed

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
COPY --from=build /out/api /usr/local/bin/api
COPY --from=build /out/seed /usr/local/bin/seed
USER app
# Which code this image is, for the console's System page. Last, so a new
# commit does not throw away the layers above it.
ARG SHADOWLINE_VERSION=
ENV SHADOWLINE_VERSION=${SHADOWLINE_VERSION}
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/api"]
