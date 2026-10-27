FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY database/prisma database/prisma
RUN npm install --workspace=apps/api --include-workspace-root
COPY apps/api apps/api
RUN npx prisma generate --schema database/prisma/schema.prisma
RUN npm run build -w apps/api

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/database/prisma database/prisma
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
