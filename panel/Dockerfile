# Panel IAGRO — imagen de producción (Next.js standalone)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Herramientas de línea de comandos (migraciones, crear admin)
FROM deps AS tools
COPY scripts ./scripts
COPY db ./db

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Valor ficticio solo para el build (el pool no se conecta hasta la primera consulta)
RUN DATABASE_URL=postgres://build:build@localhost:5432/build npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
