LABEL org.opencontainers.image.source="https://github.com/acdgbrasil/svc-people-context"
LABEL org.opencontainers.image.description="People Context — Central identity registry for the ACDG ecosystem"
LABEL org.opencontainers.image.licenses="MIT"

FROM oven/bun:1.3.11-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src

FROM oven/bun:1.3.11-slim
WORKDIR /app
COPY --from=build /app .
EXPOSE 3000
USER bun
CMD ["bun", "run", "src/index.ts"]
