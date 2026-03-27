# WebP Converter API

Guia practica para equipos que consumen el servicio de conversion a WebP.

## Base URL

- Produccion: `https://webp.simetry.cl`
- Fallback Fly: `https://<tu-app>.fly.dev`

## Resumen rapido

- Endpoint principal: `POST /convert`
- Entrada: `multipart/form-data` con un archivo en `image`
- Salida exitosa: bytes de imagen WebP (`Content-Type: image/webp`)
- Salud del servicio: `GET /health`

## Endpoint: `POST /convert`

Convierte una imagen de entrada a formato WebP aplicando transformaciones opcionales.

### Request

- **Metodo:** `POST`
- **Content-Type:** `multipart/form-data`
- **Headers recomendados:**
  - `Accept: image/webp,image/*,*/*`

### Campos `form-data`

| Campo       | Tipo    | Requerido | Regla | Default |
|-------------|---------|-----------|-------|---------|
| `image`     | archivo | Si        | Imagen valida | - |
| `quality`   | string/int | No     | Entero `1-100` | `80` |
| `scale`     | string/float | No   | Decimal `> 0` | `1` |
| `maxWidth`  | string/int | No     | Entero `> 0` | sin limite |
| `maxHeight` | string/int | No     | Entero `> 0` | sin limite |
| `format`    | string  | No        | Usado en flujos HEIC (`heic`) | - |

### Orden de transformacion

1. Se aplica `scale` sobre la dimension original.
2. Se aplica limite por `maxWidth`/`maxHeight` manteniendo aspecto.
3. Se codifica a WebP con `quality`.

### Response (exito)

- **Status:** `200 OK`
- **Content-Type:** `image/webp`
- **Body:** binario WebP

No retorna JSON en exito.

---

## Endpoint: `GET /health`

Permite validar disponibilidad del servicio.

### Response

- **Status:** `200 OK`
- **Content-Type:** `application/json`
- **Body:**

```json
{ "status": "ok" }
```

---

## Errores y como manejarlos

El servicio responde errores en texto plano (no JSON).

| Status | Cuando ocurre | Que hacer en el cliente |
|--------|----------------|-------------------------|
| `400`  | Parametros invalidos (`quality`, `scale`, `maxWidth`, `maxHeight`), archivo vacio o demasiado grande | Corregir input y reintentar |
| `415`  | Tipo de imagen no soportado o archivo invalido | Validar tipo antes de enviar |
| `500`  | Falla interna inesperada | Reintentar con backoff, loggear incidente |
| `504`  | Conversion supera timeout de request | Reintentar con imagen menor o parametros mas agresivos |

Recomendacion de UX:

- Mostrar un error legible al usuario final.
- Mantener detalle tecnico en logs internos de la app/extension.

---

## Ejemplos de consumo

### cURL minimo

```bash
curl -X POST "https://webp.simetry.cl/convert" \
  -F "image=@foto.jpg" \
  -F "quality=80" \
  --output foto.webp
```

### cURL con escala y limites

```bash
curl -X POST "https://webp.simetry.cl/convert" \
  -F "image=@foto.png" \
  -F "quality=85" \
  -F "scale=0.5" \
  -F "maxWidth=1200" \
  -F "maxHeight=1200" \
  --output foto_optimizada.webp
```

### JavaScript (fetch)

```javascript
async function convertToWebp(file, options = {}) {
  const form = new FormData();
  form.append("image", file);

  if (options.quality != null) form.append("quality", String(options.quality));
  if (options.scale != null) form.append("scale", String(options.scale));
  if (options.maxWidth != null) form.append("maxWidth", String(options.maxWidth));
  if (options.maxHeight != null) form.append("maxHeight", String(options.maxHeight));
  if (options.format != null) form.append("format", String(options.format));

  const resp = await fetch("https://webp.simetry.cl/convert", {
    method: "POST",
    headers: {
      Accept: "image/webp,image/*,*/*"
    },
    body: form
  });

  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(`Conversion failed (${resp.status}): ${message}`);
  }

  return await resp.blob(); // image/webp
}
```

---

## Limites operativos (actuales)

- Tamano maximo por archivo: `20 MB`
- Timeout por request: `60s`
- Formatos soportados:
  - `image/jpeg`
  - `image/png`
  - `image/gif`
  - `image/webp`
  - `image/heic`
  - `image/heif`

> Estos limites pueden cambiar por configuracion del servicio.

---

## CORS y uso desde extension Chrome

El servicio habilita CORS para `POST` y `OPTIONS`.

Si consumes desde extension:

- Enviar `POST /convert` con `multipart/form-data`.
- Esperar respuesta binaria (`blob`) en exito.
- Manejar preflight sin logica especial (ya soportado por backend).

---

## OpenAPI (documentacion interactiva)

- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`

Ejemplos:

- `https://webp.simetry.cl/docs`
- `https://webp.simetry.cl/openapi.json`

