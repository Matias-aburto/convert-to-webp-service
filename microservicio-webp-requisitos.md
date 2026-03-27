# Requisitos del microservicio para conversión a WebP

## Objetivo

Definir qué debe implementar el microservicio para que la funcionalidad de conversión WebP de la extensión funcione correctamente tanto para:

- Conversión de imágenes detectadas en una página (URL remota).
- Conversión de archivos locales subidos por drag & drop.

---

## Contrato mínimo esperado por la extensión

La extensión realiza `POST` a:

- `https://webp.simetry.cl/convert`

Con `multipart/form-data` y estos campos:

- `image` (**obligatorio**): archivo binario de imagen.
- `quality` (opcional pero enviado por la extensión): entero `1-100`.
- `scale` (opcional): número decimal positivo (ej: `0.5`, `1`, `2`).
- `maxWidth` (opcional): entero positivo.
- `maxHeight` (opcional): entero positivo.
- `format` (opcional): usado en HEIC, valor esperado `heic`.

Respuesta esperada en éxito:

- HTTP `200`.
- Cuerpo binario de la imagen convertida (WebP).
- `Content-Type: image/webp` (recomendado/esperado).

Respuesta esperada en error:

- HTTP `4xx` o `5xx`.
- Cuerpo en texto con detalle del error (la extensión lo muestra en logs/errores).

---

## Requisitos funcionales

### 1) Endpoint de conversión

- Implementar `POST /convert`.
- Consumir `multipart/form-data`.
- Leer y validar parámetros.
- Convertir la imagen a WebP.
- Retornar blob WebP directamente en el body.

### 2) Soporte de formatos de entrada

Mínimo recomendado:

- `image/jpeg`
- `image/png`
- `image/gif` (si se soporta animado, documentarlo)
- `image/webp` (puede re-optimizar)
- `image/heic` / `image/heif` (la extensión lo intenta enviar explícitamente)

Si un formato no es soportado:

- Retornar `415 Unsupported Media Type` con mensaje claro.

### 3) Calidad (`quality`)

- Rango recomendado: `1-100`.
- Si no viene, usar default seguro (por ejemplo `80`).
- Si viene inválido, responder `400 Bad Request`.

### 4) Escalado (`scale`)

- Debe aceptar decimal positivo.
- Si no viene, usar `1`.
- Aplicar escala sobre dimensiones originales.
- Si `scale <= 0` o inválido: `400 Bad Request`.

### 5) Dimensiones máximas (`maxWidth`, `maxHeight`)

- Deben ser enteros positivos.
- Se puede enviar solo una de las dos.
- Mantener proporción de aspecto.
- Si ambas vienen, no exceder ninguna.
- Si inválidas (negativas, no numéricas, fuera de rango), devolver `400`.

Orden recomendado de transformación:

1. Aplicar `scale`.
2. Aplicar límites de `maxWidth`/`maxHeight`.
3. Codificar a WebP con `quality`.

### 6) Nombre/descarga del archivo

La extensión define el nombre de descarga localmente, por lo que el backend no necesita `Content-Disposition`.

---

## Requisitos técnicos no funcionales

### CORS (obligatorio para extensión Chrome)

Habilitar CORS para solicitudes desde la extensión. Recomendado:

- Permitir `POST`, `OPTIONS`.
- Permitir headers estándar (`Accept`, `Content-Type`).
- Responder preflight (`OPTIONS`) con `2xx`.

> Nota: la extensión envía `Accept: image/webp,image/*,*/*` en algunos flujos.

### Rendimiento y límites

- Tamaño máximo de archivo configurable (ej: 20 MB o según negocio).
- Timeout por request razonable (ej: 30-60s).
- Control de memoria para evitar caídas con imágenes grandes.

### Estabilidad

- Manejo de errores consistente (siempre con mensaje legible).
- No exponer trazas internas al cliente en producción.

### Observabilidad

Registrar al menos:

- Nombre/tipo/tamaño de entrada (sin datos sensibles).
- Parámetros recibidos (`quality`, `scale`, `maxWidth`, `maxHeight`).
- Dimensiones origen y salida.
- Duración de la conversión.
- Código de estado resultante.

---

## Especificación sugerida de respuestas

### Éxito

- **Status:** `200 OK`
- **Headers:** `Content-Type: image/webp`
- **Body:** bytes WebP

### Error de validación

- **Status:** `400 Bad Request`
- **Body (texto o JSON):** detalle de parámetro inválido

### Formato no soportado

- **Status:** `415 Unsupported Media Type`
- **Body:** mensaje explicativo

### Error interno

- **Status:** `500 Internal Server Error`
- **Body:** mensaje genérico

---

## Ejemplos de consumo

### Caso básico

```bash
curl -X POST "https://webp.simetry.cl/convert" \
  -F "image=@foto.jpg" \
  -F "quality=80" \
  --output foto.webp
```

### Con escala y límites de dimensión

```bash
curl -X POST "https://webp.simetry.cl/convert" \
  -F "image=@foto.png" \
  -F "quality=85" \
  -F "scale=0.5" \
  -F "maxWidth=1200" \
  -F "maxHeight=1200" \
  --output foto_optimizada.webp
```

### HEIC

```bash
curl -X POST "https://webp.simetry.cl/convert" \
  -F "image=@foto.heic;type=image/heic" \
  -F "format=heic" \
  -F "quality=80" \
  --output foto.webp
```

---

## Endpoint de salud (recomendado)

Implementar:

- `GET /health` -> `200 OK` con payload simple (`ok` o JSON).

Permite monitoreo y diagnóstico rápido del servicio.

---

## Checklist de cumplimiento

- [ ] Existe `POST /convert` y retorna `image/webp`.
- [ ] Acepta `multipart/form-data` con campo `image`.
- [ ] Soporta `quality`, `scale`, `maxWidth`, `maxHeight`, `format`.
- [ ] Valida parámetros y responde `400` con mensaje útil.
- [ ] Maneja formatos no soportados con `415`.
- [ ] CORS y preflight `OPTIONS` habilitados para uso desde extensión.
- [ ] Maneja HEIC/HEIF (o lo rechaza explícitamente y documentado).
- [ ] Tiene límites de tamaño/timeout configurados.
- [ ] Tiene logs básicos y endpoint `GET /health`.

