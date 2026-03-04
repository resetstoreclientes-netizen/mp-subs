# Proyecto: MP Suscripciones — Shopify App con MercadoPago

## Objetivo
Shopify App que permite vender un producto consumible (gotero) por suscripción, usando MercadoPago como procesador de pagos recurrentes. La app actúa como puente ya que Shopify NO soporta MP como gateway nativo para suscripciones.

## Stack
- **Framework**: Shopify Remix App (template oficial)
- **Runtime**: Node.js
- **DB**: SQLite con Prisma
- **MP SDK**: `mercadopago` (npm) — API PreApproval
- **Shopify API**: GraphQL Admin API via `@shopify/shopify-app-remix`
- **Storefront**: Theme App Extension (Liquid)

## Arquitectura (actualizada)

```
SUSCRIPCIÓN:
  Product page → cliente elige plan (cards estilo Grüns)
  → Modal recoge datos de envío (email, nombre, dirección, etc.)
  → POST /api/subscription → crea PreApproval en MP → retorna init_point
  → Redirect a MP → cliente autoriza pago recurrente + primer cobro en UN paso
  → MP callback → /api/subscription/callback (muestra resultado)
  → MP webhook → /webhooks/mercadopago
  → App: findOrCreateCustomer → createDraftOrder → completeDraftOrder → markOrderAsPaid
  → Orden creada en Shopify ✓

RECURRENTE (cada mes):
  MP cobra auto → webhook → nueva orden en Shopify

COMPRA ÚNICA:
  Add to Cart normal → Shopify checkout con MP como gateway
```

## Estructura de archivos

```
app/routes/
├── app._index.tsx              # Dashboard con stats
├── app.plans.tsx               # CRUD planes (cantidad, precio, descuento)
├── app.settings.tsx            # Credenciales MercadoPago
├── api.subscription.tsx        # GET: planes / POST: crear suscripción
├── api.subscription.callback.tsx # Callback post-pago MP
├── webhooks.mercadopago.tsx    # Webhook MP → crea órdenes Shopify
app/services/
├── mercadopago.server.ts       # PreApproval: create, get, cancel
├── shopify.server.ts           # GraphQL: customers, draft orders, selling plans
extensions/mp-subscription-block/
├── blocks/subscribe-button.liquid  # UI estilo Grüns + modal
├── locales/es.default.json
prisma/schema.prisma            # Session, Settings, Plan, Subscription
```

## Reglas de desarrollo
- TypeScript siempre
- Errores con try/catch + console.error
- Validar inputs del usuario
- Credenciales en DB (Settings), nunca hardcodeadas
- Remix patterns: loaders/actions server-side
- Webhooks: usar `unauthenticated.admin(shop)`, NO `authenticate.admin`
- Draft orders: siempre incluir shipping address + marcar como pagado
- Theme extensions: necesitan `locales/` directory
- UI admin: Polaris components
- Comunicación: español (Argentina)

## Comandos útiles
```bash
npx remix vite:dev              # Dev server (puerto 3000)
npx cloudflared tunnel --url http://localhost:3000  # Tunnel
npx shopify app deploy          # Deploy app + extensions
npx prisma migrate dev          # Migrations
npx tsc --noEmit                # Type check
```

## Automejora
La IA mantiene memoria persistente en `~/.claude/projects/.../memory/`:
- `MEMORY.md` — resumen principal (se carga automático)
- `architecture.md` — flujos y modelos detallados
- `patterns.md` — patrones técnicos confirmados
- `debugging.md` — errores resueltos
- `preferences.md` — preferencias del usuario
- `session-state.md` — estado de trabajo actual
- `self-improvement.md` — protocolo de automejora

**Protocolo**: Al final de cada sesión, actualizar `session-state.md`. Al resolver errores, documentar en `debugging.md`. Al confirmar patrones (2+ usos), agregar a `patterns.md`.
