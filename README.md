# Compra Fácil — versión 1.0.0 de lanzamiento

Tienda online para productos variados con destinos Panamá y Cuba.

## Incluido en v1.0
- Catálogo e inventario servidos desde el backend.
- Buscador, categorías y fichas de producto.
- Carrito persistente en el navegador.
- Checkout con validación del servidor.
- Creación real de pedidos y descuento de inventario.
- Consulta de pedido por número + teléfono.
- Panel administrativo en `/admin`.
- Login de administrador con contraseña bcrypt.
- Alta/edición de productos y actualización de estados de pedidos.
- Protección básica: Helmet, cookies seguras en producción, límites de tamaño y rate limiting de endpoints sensibles.
- Docker y docker-compose.
- Diseño responsive móvil/escritorio.

## Puesta en marcha local
Requisitos: Node.js 20+.

1. `cp .env.example .env`
2. Genera un hash para la contraseña:
   `node -e "console.log(require('bcryptjs').hashSync('TU_CONTRASEÑA', 12))"`
3. Coloca ese hash en `ADMIN_PASSWORD_HASH` y configura `ADMIN_EMAIL` y `SESSION_SECRET`.
4. `npm install`
5. `npm start`
6. Abre `http://localhost:3000`.
7. Administración: `http://localhost:3000/admin`.

## Docker
1. Crea `.env` a partir de `.env.example`.
2. `docker compose up -d --build`
3. Abre `http://localhost:3000`.

## Antes de aceptar dinero real
Esta v1.0 permite crear pedidos, pero **no activa por sí sola un cobro con tarjeta**. Para cobrar online hay que configurar un proveedor que opere con tu negocio y tus mercados. No se asume que un proveedor determinado funcione en Cuba.

También conviene contratar un dominio, HTTPS, correo transaccional y un proveedor de hosting/VPS con almacenamiento persistente. El almacenamiento JSON incluido es apropiado para una primera tienda de bajo volumen en un único servidor; si el tráfico crece, migra a PostgreSQL/Supabase.

## Datos
`data/products.json` contiene el catálogo inicial. `data/orders.json` contiene pedidos. Haz copias de seguridad de `data/`.

## Estado de lanzamiento
Código preparado como **release 1.0.0**. La publicación pública final todavía requiere las cuentas/credenciales externas que solo el propietario del negocio puede proporcionar: dominio/hosting y proveedor de pagos, además de definir la logística real para Panamá y Cuba.
