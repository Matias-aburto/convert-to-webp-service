# webp-converter

Microservicio para convertir imagenes a WebP para consumo desde una extension de Chrome.

## Documentacion para consumidores

- Guia de API para integradores: `API.md`
- OpenAPI/Swagger: `/docs`, `/redoc`, `/openapi.json`

## Endpoints

- `POST /convert`
- `OPTIONS /convert`
- `GET /health`

## Request `POST /convert`

Debe enviarse `multipart/form-data` con:

- `image` (obligatorio): archivo de imagen.
- `quality` (opcional): entero `1-100`, default `80`.
- `scale` (opcional): decimal positivo, default `1`.
- `maxWidth` (opcional): entero positivo.
- `maxHeight` (opcional): entero positivo.
- `format` (opcional): para HEIC puede enviarse `heic`.

Respuesta en exito:

- `200 OK`
- `Content-Type: image/webp`
- body binario WebP

Respuesta en error:

- `400` para validaciones
- `415` para formato no soportado
- `500` para error interno

## Formatos soportados

- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`
- `image/heic`
- `image/heif`

## Desarrollo local

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

Probar:

```bash
curl -X POST "http://localhost:8080/convert" \
  -F "image=@foto.jpg" \
  -F "quality=80" \
  --output foto.webp
```

## Despliegue en Fly.io

Prerequisitos:

- Fly CLI instalado (`flyctl`)
- Login realizado (`flyctl auth login`)

Pasos:

```bash
flyctl launch --no-deploy
flyctl deploy
flyctl open
```

Healthcheck:

```bash
curl https://<tu-app>.fly.dev/health
```

## Variables de entorno

- `MAX_UPLOAD_MB` (default: `20`)
- `REQUEST_TIMEOUT_SECONDS` (default: `60`)
- `MAX_PIXELS` (default: `50000000`)
- `LOG_LEVEL` (default: `INFO`)
