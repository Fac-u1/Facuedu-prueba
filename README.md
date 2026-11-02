# Facuedu.uy AYUDA Navegadore — versión 1.1.0

Navegador de escritorio hecho con **Electron**, pensado para niños de primaria y sus familias.

## Novedades de la versión 1.1.0

- **Inicio de sesión opcional con Supabase**: correo y contraseña, Google, GitHub, o desde el teléfono con código QR. Sin cuenta el navegador funciona igual (modo invitado). Se entra y sale desde el menú ⋮.
- **Video de bienvenida** la primera vez que se abre (`assets/bienvenida.mp4`).
- **Motores de búsqueda**: Google (predeterminado), Bing, DuckDuckGo, Amazon, eBay, Wikipedia y Perplexity. Se eligen en el menú ⋮ → Motor de búsqueda.
- **Anclar sitios**: clic derecho en una pestaña → Anclar, o el menú ⋮. Barra de accesos rápidos siempre visible, hasta 12 anclados, guardados por cuenta.
- **Extensiones**: panel con el ícono de rompecabezas. Activar, desactivar, quitar, e instalar desde una carpeta descomprimida (con `manifest.json`).
- **Ayuda**: menú ⋮ → Ayuda. Explicaciones cortas y enlace "Para saber más".
- Lo que ya existía sigue igual: pestañas, barra de direcciones, historial, borrar historial, descargas con progreso, traducir página, corrector ortográfico y temas Negro / Claro / Negro y Claro.

## 1. Requisitos

- [Node.js](https://nodejs.org/) 18 o superior.

## 2. Probar en modo desarrollo

```
npm install
npm start
```

`npm install` instala también `@supabase/supabase-js` y `qrcode`, que son necesarios para el inicio de sesión.

## 3. Generar el ejecutable

**Plataformas que se compilan** (todas en GitHub Actions, con el workflow **Build todas las plataformas**):
- **Windows:** `.exe` (instalador NSIS) y portable, de **64 bits** y de **32 bits** (ia32). Requiere Windows 10 o más.
- **Linux:** **AppImage** y **.deb** de **64 bits**. Electron dejó de compilar Linux de 32 bits en la versión 19, así que no hay build de 32 bits.
- **macOS:** `.dmg` y `.zip` para Apple Silicon (arm64) e Intel (x64). Requiere macOS 11 o más. Para Macs con macOS 10.14 usá el workflow **Build macOS legacy**.

Los comandos locales son `npm run build:win`, `npm run build:linux` y `npm run build:mac`, pero cada uno tiene que correrse en su sistema.



**Windows** (instalador + versión portable en `dist/`):
```
npm run build:win
```

**Linux** (AppImage y .deb en `dist/`):
```
npm run build:linux
```

**Firma y notarización de macOS (recomendado para no tener advertencias):**

Necesitás una cuenta de Apple Developer (99 USD por año) y estos secretos en GitHub (**Settings → Secrets and variables → Actions**):

| Secreto | Qué es |
|---|---|
| `MAC_CERT_P12_BASE64` | Certificado "Developer ID Application" exportado como `.p12` y convertido a base64 (`base64 -i certificado.p12 \| pbcopy`) |
| `MAC_CERT_PASSWORD` | La contraseña que pusiste al exportar el `.p12` |
| `APPLE_ID` | El correo de tu cuenta de Apple Developer |
| `APPLE_APP_SPECIFIC_PASSWORD` | Contraseña específica de app, creada en appleid.apple.com |
| `APPLE_TEAM_ID` | Tu Team ID (10 caracteres, en developer.apple.com → Membership) |

Cuando los secretos están, el workflow firma y notariza la app sola. Si no los ponés, compila sin firma y macOS la bloquea al abrirla.

**macOS** (`.dmg` y `.zip`, para Intel y Apple Silicon): no se puede compilar desde Windows o Linux. Hay un workflow de GitHub Actions que lo hace en un Mac virtual:

1. Subí esta carpeta a un repositorio de GitHub.
2. Entrá a **Actions → Build macOS → Run workflow** (o creá un tag `v1.1.0` para que se ejecute solo).
3. Cuando termine, bajá el artefacto `facuedu-navegadore-mac`.

Si preferís compilarlo en un Mac propio: `npm install` y después `npm run build:mac`.

**Aviso de seguridad de macOS:** sin una cuenta de Apple Developer, la app no está firmada ni notarizada. Al abrirla por primera vez, macOS puede bloquearla. Para permitirla: clic derecho en la app → **Abrir**, o en Ajustes del Sistema → Privacidad y seguridad → **Abrir igualmente**. Si macOS dice que está "dañada", ejecutá en Terminal: `xattr -cr "/Applications/Facuedu.uy AYUDA Navegadore.app"`.

## 4. Configurar Supabase (una sola vez)

1. En Supabase, abrí el SQL Editor, pegá el contenido de `supabase.sql` y ejecutalo.
2. Desplegá la función de aprobación desde la carpeta del proyecto (requiere la CLI de Supabase):
   ```
   npx supabase login
   npx supabase link --project-ref xkzohictfqvdrvqyqdco
   npx supabase functions deploy aprobar-login
   ```
3. En **Authentication → Providers** activá **Google** y **GitHub**. Cada uno pide un Client ID y Client Secret que se crean en Google Cloud Console y en GitHub (Settings → Developer settings → OAuth Apps). La URL de callback que te piden es la de tu proyecto: `https://xkzohictfqvdrvqyqdco.supabase.co/auth/v1/callback`.
4. En **Authentication → URL Configuration**, agregá a **Redirect URLs** `facuedu://auth` (para el inicio con Google/GitHub desde la app), además de: `https://regedit-ayudanavegadore.netlify.app/**` y `https://regedit-ayudanavegadore.netlify.app/desktop`. El `/**` es necesario porque la vuelta de Google/GitHub lleva `?login=` en la dirección.
5. Si querés que el correo no pida confirmación, desactivá **Confirm email** en Authentication → Providers → Email. Si lo dejás activado, cada cuenta nueva tiene que confirmar el correo antes de entrar.

## 5. Publicar la página del teléfono en Netlify

1. Entrá a Netlify y arrastrá la carpeta `web-telefono/` a la zona "Deploy manually". Te da una dirección tipo `https://nombre.netlify.app`.
2. En **`config.js`** ya quedó `https://regedit-ayudanavegadore.netlify.app/`. Si cambia tu sitio, actualizá las dos direcciones.
3. Esa misma dirección va en Supabase (paso 4).
4. El código QR se genera solo en la app a partir de `PHONE_LOGIN_URL`. Si preferís usar un QR ya diseñado, mandanos la imagen y lo cambiamos.

## 6. Cómo funciona el código del teléfono

Usá el QR que muestra **la computadora** (con el código). El QR fijo que diseñaste apunta a la raíz del sitio sin código, así que la página no puede aprobar nada desde ahí.

La computadora muestra un código que empieza con `SDFANL-` y un QR con ese mismo código. Tenés dos formas de usarlo: escanear el QR, o copiar el código (botón **Copiar**) y pegarlo en el campo **Código** de la página del teléfono. En el teléfono iniciás sesión, tocás "Sí, iniciar sesión en la computadora", y la función `aprobar-login` autoriza a la computadora con un enlace de **un solo uso** y de **vida corta**. La computadora lo canjea y entra. El código vence a los 3 minutos.

**Importante:** después de actualizar, volvé a ejecutar `supabase.sql` y a desplegar `aprobar-login`, porque el prefijo cambió a `SDFANL-`.

## 7. Estructura

```
facuedu-project/
├── main.js                  → proceso principal: ventanas, pestañas, sesión, extensiones, anclados
├── preload.js               → puente seguro entre la interfaz y main.js
├── preload-page.js          → preload vacío para las páginas de cada pestaña
├── config.js                → URL y clave de Supabase, y direcciones de Netlify
├── supabase.sql             → tabla y funciones para el inicio desde el teléfono
├── supabase/functions/aprobar-login/index.ts  → función que autoriza la computadora desde el teléfono
├── web-telefono/index.html  → página de Netlify que se abre desde el QR
├── package.json             → versión 1.1.0 y configuración de builds
├── src/
│   ├── index.html           → interfaz del navegador (bienvenida, login, anclados, paneles)
│   ├── renderer.js          → lógica de la interfaz
│   ├── style.css            → estilos y variables de los temas
│   ├── newtab.html          → página de nueva pestaña con el buscador elegido
│   ├── ayuda.html           → página de ayuda
│   └── extensiones.html     → guía de extensiones (se abre desde el panel de extensiones)
└── assets/
    ├── logo.png / icon.png / icon.ico
    └── bienvenida.mp4       → video de bienvenida
```

## Ayuda y herramientas para desarrolladores

- El menú ⋮ → **Encuentro de Facuedu.uy AYUDA** abre el documento de ayuda de Google Docs (`config.js` → `HELP_URL`). Para que se vea desde la app, el documento tiene que estar compartido como **"Cualquier persona con el enlace"**.
- **F12**, **Ctrl + Shift + I** (Mac: **Cmd + Option + I**) o el menú ⋮ → **Herramientas para desarrolladores** abren la consola de la página actual.
- El inicio con Google/GitHub se abre en el navegador del sistema y vuelve a la app. Si Google muestra "no es seguro", es porque se abrió dentro de una ventana de la app: esta versión ya no hace eso.

## Guía de extensiones

El panel de extensiones tiene el botón **Guía de extensiones (paso a paso)**, que abre `src/extensiones.html` en una pestaña. Para cambiar textos o enlaces, editá ese archivo.

## 8. Límites que conviene conocer

- **Google y GitHub** pueden bloquear el inicio dentro de ventanas de aplicaciones en algunos casos. Si pasa, usá correo y contraseña o el teléfono.
- **Extensiones**: Electron soporta solo una parte de la API de Chrome. Las de Chrome Web Store, Edge y Opera GX pueden funcionar, pero no todas. Firefox (.xpi) no funciona. Las extensiones se instalan desde una carpeta descomprimida; la app no las descarga de las tiendas por sí sola.
- **Al cerrar sesión** se borran cookies y datos web del navegador, así la siguiente cuenta no ve nada de la anterior. Esto también cierra la sesión de sitios como Google dentro del navegador.
- **Historial, descargas y anclados** quedan separados por cuenta. Las extensiones y la configuración (tema y buscador) son del equipo, no de la cuenta.
- **Datos viejos**: el historial y las descargas de la versión 1.0 quedan en la carpeta anterior y no se migran automáticamente.
- **Mientras hay un panel o menú abierto**, la página de la pestaña se oculta por un momento para que el panel se vea bien.
- **Electron no corre en Android**. Para Android habría que hacer otra app.

## 9. Qué probar a mano

1. Primera vez: bienvenida → video → elegir tema.
2. Crear cuenta con correo, cerrar sesión, entrar de nuevo. Probar contraseña incorrecta.
3. Probar Google o GitHub (si están configurados).
4. Iniciar sesión con el teléfono: escanear el QR, aprobar, y ver que entra sola.
5. Anclar un sitio con clic derecho en una pestaña, cerrar y abrir la app, y ver que sigue anclado. Desanclar con la ✕.
6. Cambiar el motor de búsqueda y buscar desde la página de inicio.
7. Instalar una extensión desde una carpeta, desactivarla, activarla y quitarla. Probar una carpeta sin `manifest.json`.
8. Abrir Ayuda con el tema Negro y con el tema Claro.
9. Cerrar sesión con dos cuentas distintas y comprobar que el historial no se mezcla.
