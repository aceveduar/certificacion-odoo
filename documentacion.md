# Certificación Funcional Odoo 19 — Documentación del sistema

App de una sola página (`index.html` + `app.js` + `style.css`, sin build tooling) para que el equipo de Sunname se prepare y rinda el examen de certificación funcional de Odoo 19. Usa Supabase como backend (Auth + Postgres) — no hay servidor propio.

## 1. Acceso e identidad

- **Login real con Supabase Auth** (correo + contraseña). No hay registro público: las cuentas las crea el administrador manualmente desde el dashboard de Supabase (Authentication → Users) y luego se vincula cada una a una fila en la tabla `profiles`.
- Cada cuenta tiene un **perfil** (`profiles`: `user_id`, `display_name`, `is_admin`) que define:
  - El **nombre que se muestra** en la app (avatar con iniciales + nombre).
  - Si la cuenta es **administrador/auditor** (`is_admin = true`) — accede automáticamente a todas las herramientas editoriales al iniciar sesión, sin contraseña adicional.
- Administradores actuales: `eacevedo@sunname.com.mx`, `amartinez@sunname.com.mx`, `mmartinez@sunname.com.mx`. El resto son usuarios comunes.
- El botón con las iniciales del usuario permite cerrar sesión (`showUserMenu` → confirmación → `signOut`).

## 2. Vista de usuario común (las personas que rinden el examen)

### Modos de estudio (pestañas superiores)
- **📖 Estudio**: navega el banco de preguntas, ve la respuesta correcta resaltada de inmediato. Pensado para repasar contenido.
- **🎯 Práctica**: responde sin ver la respuesta hasta seleccionar una opción; se resalta si acertó o falló. Al terminar guarda la sesión (`practice_sessions`) con su puntaje.
- **🎓 Examen**: presenta un examen real, con cronómetro y sin posibilidad de ver respuestas hasta entregarlo (ver sección 3).

### Barra lateral
- Buscador de preguntas.
- **Mi progreso**: tarjeta con el resultado de tu última sesión guardada (✅/⚠️/❌ según el % logrado, "hace X tiempo") y un enlace "Ver progreso completo →" que abre el historial de tus últimas 20 sesiones. Si no tienes sesiones guardadas, te invita a practicar un módulo.
- **Módulos**: filtra el banco de preguntas por sección/módulo (CRM, Accounting, AI, etc.).

> Las secciones "Estado", "Respuesta" y "Examen" del sidebar (filtros editoriales por bandera, por tipo de respuesta, por prueba) son exclusivas del auditor — un usuario común no las ve.

### Botón 📈 "Mi progreso" (topbar)
Abre un modal con el historial completo de tus últimas 20 sesiones de práctica/examen: módulo o prueba, modo, % obtenido, fecha.

## 3. Tipos de examen

El usuario común solo ve las opciones que el **auditor haya activado** desde "⚙️ Exámenes por módulo":

- **Examen por módulo**: examen acotado a un solo módulo/sección (p. ej. solo CRM), con duración configurada por el auditor (por defecto 30 min).
- **🌐 Examen completo**: examen que combina **todas las secciones** del banco en un solo simulacro, con su propia duración configurable (por defecto 90 min). Aparece destacado (tarjeta resaltada) sobre la lista de módulos cuando el auditor lo activa.
- Si el auditor no ha activado ningún examen todavía, se muestra un aviso pidiendo que lo configure.

Mecánica común a ambos tipos: preguntas en orden aleatorio, cronómetro visible que entrega el examen automáticamente al agotarse el tiempo, resultado final con % obtenido y aprobado/no aprobado, desglose por sección, y guardado automático de la sesión (`practice_sessions`) — visible luego en "Mi progreso" y en "🏆 Resultados por persona" del auditor.

> Nota: mientras un usuario común está eligiendo su examen, el banco completo de preguntas permanece oculto (sidebar, contador, lista) — no puede "hojear" las preguntas antes de presentarlo.

### Simulacro de examen (solo auditor/admin)
Desde la vista de auditor, "Examen" muestra además un **"Simulacro de Examen"** de 90 minutos sobre todo el banco o sobre una prueba específica (Prueba 1/2/3) — pensado para que el auditor pruebe el examen tal como lo vivirá un usuario.

## 4. Herramientas del auditor / administrador

Disponibles a través del menú desplegable **🛠️** en la topbar (visible solo para `is_admin = true`):

- **🏆 Resultados por persona**: agrupa todas las sesiones guardadas (`practice_sessions`) por usuario — muestra mejor puntaje de examen, veredicto ✅/❌ aprobado/no aprobado, número de intentos, promedio y última actividad. Al hacer clic en una persona se ve su historial completo de sesiones.
- **📊 Resultados**: panel de referencia con capturas de los exámenes oficiales (Prueba 1/Prueba 2) para comparar contra el banco de preguntas.
- **🕐 Historial de actividad**: bitácora de acciones editoriales (creación/edición/eliminación de preguntas, cambios de sección, activación/desactivación de exámenes, cambios de duración, etc.) con autor y fecha.
- **⚙️ Exámenes por módulo**: panel donde el auditor decide qué exámenes están disponibles para los usuarios:
  - Activa/desactiva el examen de cada módulo individualmente y define su duración (5–240 min).
  - Activa/desactiva el **🌐 Examen completo** (todas las secciones combinadas) y define su propia duración.
  - Botones "Seleccionar todos" / "Desmarcar todos" para activar o desactivar en bloque todos los módulos de una vez.

Además, en modo auditor (botón 🔑/🚪 para entrar y salir):
- **FAB ＋**: agregar nuevas preguntas al banco.
- **Edición completa de preguntas**: editar enunciado, opciones, respuesta correcta, sección, prueba asignada; marcar "mi respuesta" (📌) para registrar lo que el auditor respondió en el examen real.
- **Reordenar preguntas** arrastrando (drag & drop) dentro de cada sección.
- **Banderas de estado** por pregunta: ✅ Segura, 🔍 A revisar, ⚠️ Ilegible — para marcar el avance de la revisión del banco.
- **Filtros adicionales** en el sidebar: por estado/bandera, por tipo de respuesta (con respuesta correcta / con "mi respuesta" / sin responder), por prueba asignada.
- **Vista previa como usuario común**: alternar el modo auditor sin cerrar sesión, para ver exactamente lo que verá una persona normal.

## 5. Otros detalles de la interfaz

- **Tema claro/oscuro** (🌙/☀️), persistido en `localStorage`.
- Diseño responsive (sidebar colapsable, topbar adaptado a móvil).
- Notificaciones tipo *toast* para confirmar acciones (guardar, activar examen, errores de Supabase, etc.).

## 6. Modelo de datos (Supabase)

| Tabla | Para qué sirve |
|---|---|
| `preguntas` | Banco de preguntas: enunciado, opciones, respuesta correcta, sección/módulo, prueba asignada, banderas de estado, orden, autoría/edición. |
| `profiles` | Vincula cada cuenta de Supabase Auth con su nombre visible y si es administrador (`is_admin`). Sin políticas de escritura — se editan manualmente desde el Table Editor para que nadie pueda autoasignarse permisos de admin. |
| `exam_configs` | Qué exámenes están activos para los usuarios comunes y su duración: una fila por módulo (`section`) más una fila especial con `section = '__FULL__'` para el "Examen completo". |
| `practice_sessions` | Historial de cada sesión de práctica/examen guardada: usuario, modo, prueba, total de preguntas, aciertos, % logrado, desglose por sección, duración, fecha. Alimenta "Mi progreso", "📈 progreso completo" y "🏆 Resultados por persona". |
| `activity_log` | Bitácora de acciones editoriales del auditor (qué se hizo, quién, cuándo) — alimenta "🕐 Historial de actividad". |

## 7. Archivos del proyecto

- `index.html` / `app.js` / `style.css` — la aplicación (sin build tooling, todo se sirve estático).
- `assets/prueba1.jpeg`, `assets/prueba2.png` — capturas de referencia de los exámenes oficiales (usadas en el panel "📊 Resultados" del auditor). Nota: el panel también espera `assets/prueba3.png` para la pestaña "Prueba 3", pero ese archivo no existe todavía — esa pestaña muestra una imagen rota hasta que se agregue.
