# Sistema de Seguimiento y Desarrollo Docente

Aplicación web para el registro, validación y seguimiento de la capacitación
docente y del expediente académico de una escuela. Todo el sistema funciona
con servicios de **nivel gratuito**:

| Pieza | Servicio | Costo |
|---|---|---|
| Página web (interfaz) | GitHub Pages | $0 |
| Base de datos, sesiones y archivos | Supabase (plan Free) | $0 |
| Lectura de constancias y títulos con IA | Google Gemini (clave de AI Studio) | $0 |

La clave de Gemini **nunca llega al navegador**: vive como secreto en una
función Edge de Supabase, que es la única que habla con Google.

---

## Puesta en marcha (una sola vez, ~25 minutos)

### 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Crea un **New project** (elige nombre, contraseña de base de datos y la
   región más cercana). Espera un par de minutos a que se aprovisione.
3. Ve a **SQL Editor**, pega el contenido completo del archivo
   [`supabase/schema.sql`](supabase/schema.sql) y presiona **Run**.
   Esto crea las tablas, las reglas de seguridad y el bucket de archivos.

### 2. Crear la cuenta de administrador

1. En Supabase ve a **Authentication → Users → Add user → Create new user**.
2. Escribe el correo y contraseña del administrador y activa
   **Auto Confirm User**.
3. **El primer usuario creado se convierte automáticamente en administrador**
   (así lo define el esquema). Los docentes se dan de alta después, desde la
   propia aplicación.

### 3. Conseguir la clave gratuita de Gemini

1. Entra a [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   con una cuenta de Google y presiona **Create API key**.
2. Copia la clave (empieza con `AIza…`). No requiere tarjeta.

### 4. Crear las dos funciones Edge

En Supabase ve a **Edge Functions → Deploy a new function → Via Editor**
(editor en el navegador; no necesitas instalar nada):

1. Función `extraer`: pega el contenido de
   [`supabase/functions/extraer/index.ts`](supabase/functions/extraer/index.ts)
   y despliega. Deja activada la opción **Verify JWT** (viene activada por
   defecto): así solo usuarios con sesión pueden usarla.
2. Función `admin-docentes`: pega el contenido de
   [`supabase/functions/admin-docentes/index.ts`](supabase/functions/admin-docentes/index.ts)
   y despliega, también con **Verify JWT** activada.
3. Ve a **Edge Functions → Secrets** y agrega el secreto
   `GEMINI_API_KEY` con la clave del paso 3.

### 5. Subir este proyecto a GitHub y activar Pages

1. Crea un repositorio nuevo en [github.com](https://github.com)
   (puede ser privado; Pages funciona igual) y sube todos los archivos de
   esta carpeta. Si usas la página web de GitHub: **Add file → Upload files**
   y arrastra todo (incluida la carpeta oculta `.github`; si subes por la
   web y no te deja arrastrar carpetas, usa GitHub Desktop o `git`).
2. En Supabase ve a **Project Settings → API** y copia dos valores:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public key**
3. En tu repositorio de GitHub: **Settings → Secrets and variables →
   Actions → New repository secret**, y crea estos dos secretos:
   - `VITE_SUPABASE_URL` → el Project URL
   - `VITE_SUPABASE_ANON_KEY` → la anon public key
   (La *anon key* está diseñada para ser pública; la seguridad real la ponen
   las reglas RLS del esquema. La clave que sí es secreta —la de Gemini—
   nunca sale de Supabase.)
4. En **Settings → Pages → Build and deployment → Source** elige
   **GitHub Actions**.
5. Ve a la pestaña **Actions**, abre el workflow "Publicar en GitHub Pages"
   y presiona **Run workflow** (o simplemente sube cualquier cambio a `main`).
6. Al terminar (~1 minuto), tu aplicación queda en línea en
   `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
   Ese es el enlace que compartes con los docentes.

### 6. Primer uso

1. Abre el enlace y entra con el correo y contraseña del administrador
   (paso 2).
2. En **Docentes → Agregar docente** da de alta a cada maestro con su correo
   y una contraseña inicial (por defecto `docente123`); cada quien puede
   cambiarla después.
3. En **Administración** ajusta la meta anual de horas, el semáforo, los
   ciclos escolares y las opciones de ranking público y perfil obligatorio.

---

## Desarrollo local (opcional)

```bash
npm install
cp .env.example .env   # y llena los dos valores de Supabase
npm run dev
```

## Preguntas frecuentes

**¿Los datos son privados?**
Sí. Cada docente solo puede leer y modificar sus propios registros; las
reglas se aplican en el servidor (RLS de Postgres), no solo en la interfaz.
Para el ranking, los demás docentes únicamente ven nombre y total de horas
validadas. Validar, rechazar y eliminar es exclusivo del administrador,
también a nivel de base de datos.

**¿Qué límites tiene el plan gratuito?**
Supabase Free incluye 500 MB de base de datos y 1 GB de archivos —de sobra
para miles de constancias— y se pausa si el proyecto pasa ~1 semana sin
uso (se reactiva con un clic en el panel de Supabase). El nivel gratuito de
Gemini permite cientos de lecturas de documentos al día.

**¿Los cambios de otros usuarios se ven en tiempo real?**
Los datos se recargan al iniciar sesión y cada vez que vuelves a la pestaña
del navegador. Para forzar una actualización, basta cambiar de pestaña y
regresar, o recargar la página.

**Subí un cambio al código y no se refleja.**
Revisa la pestaña **Actions** del repositorio: cada `push` a `main` vuelve a
compilar y publicar automáticamente.
