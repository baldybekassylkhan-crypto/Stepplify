# Deploys the Express backend (server/) together with the static
# frontend (repo root) it already serves itself — see server/src/server.js,
# which does app.use(express.static(path.join(__dirname, '../../'))). One
# container, one URL, both the API and the site.
FROM node:20-slim

WORKDIR /app

# Install backend deps first so this layer is cached across deploys
# that only touch frontend files.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Now bring in everything else: backend source + the static frontend
# files server.js serves from one level above itself.
COPY . .

RUN cd server && npx prisma generate

ENV NODE_ENV=production
EXPOSE 5000

WORKDIR /app/server
# `prisma db push` is idempotent — safe to run on every boot. It's what
# actually creates the SQLite file/tables the first time the mounted
# volume is empty, and is a no-op once the schema already matches.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/server.js"]
