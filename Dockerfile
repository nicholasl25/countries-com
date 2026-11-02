FROM node:22-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/dist \
    PORT=8080
COPY backend/requirements-serve.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/main.py backend/territories.py ./
COPY backend/data ./data
COPY --from=web /src/dist ./dist
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
