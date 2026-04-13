# --- Build stage ---
FROM oven/bun:1.3-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY tsconfig.json ./
RUN bun build --compile --minify ./src/index.ts --outfile people-context

# --- Runtime stage ---
FROM gcr.io/distroless/cc-debian12
LABEL org.opencontainers.image.source="https://github.com/acdgbrasil/svc-people-context"
LABEL org.opencontainers.image.description="People Context — Central identity registry for the ACDG ecosystem"
LABEL org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=build /app/people-context ./people-context
EXPOSE 3000
CMD ["./people-context"]
