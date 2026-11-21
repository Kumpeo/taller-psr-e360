# Taller PSR-E360

Curso interactivo de teclado para el Yamaha PSR-E360B. Escucha lo que tocas por el micrófono y valida notas, acordes, pulso y brillo del sonido. Tiene un perfil por niño, con su avance guardado en el dispositivo.

Todo es gratis: HTML y JavaScript puro, Web Audio API y GitHub Pages. No usa servidor, base de datos ni cuentas.

## Estructura

| Archivo | Qué es |
|---|---|
| `src/app.html` | Interfaz, contenido del curso y lógica de los ejercicios. Aquí se agregan lecciones (arreglo `C`). |
| `src/dsp.js` | Motor de audio: YIN (notas), cromagrama (acordes), detector de ataques, pulso, centroide espectral. |
| `build.py` | Une los dos archivos anteriores en `index.html`. |
| `index.html` | Lo que publica GitHub Pages. **No se edita a mano**: se genera. |
| `tests/test_dsp.js` | Pruebas del motor de audio con señales sintéticas. |
| `manifest.webmanifest`, `icon.svg` | Permiten instalar el curso en la tablet como app. |

## Cómo trabajar en el proyecto (en casa o en la oficina)

La primera vez, en cada computador:

```powershell
git clone https://github.com/Kumpeo/taller-psr-e360.git
cd taller-psr-e360
```

Cada vez que vayas a trabajar:

1. Trae los últimos cambios: `git pull`
2. Edita `src/app.html` o `src/dsp.js`.
3. Genera la página: `python build.py`
4. Prueba el motor de audio: `node tests/test_dsp.js` (debe decir `TODO OK`).
5. Pruébala en el navegador con micrófono: `python -m http.server 8000` y abre `http://localhost:8000`.
6. Sube los cambios:
   ```powershell
   git add -A
   git commit -m "Describe el cambio"
   git push
   ```
   En uno o dos minutos GitHub Pages publica la versión nueva.

## Instalar en la tablet

1. Abre la dirección del curso en Chrome (Android) o Safari (iPad).
2. Menú → **Agregar a pantalla de inicio**.
3. La primera vez que uses un ejercicio con sonido, permite el micrófono.

## Respaldo del avance

El avance de cada niño vive en el navegador de la tablet. En la pantalla “¿Quién toca hoy?” → *Respaldo del avance* → **Copiar respaldo**, y guarda ese texto (por ejemplo, en un correo). Para recuperarlo, pégalo y pulsa **Restaurar**.
