import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { getSubscriptionStatus } from "../services/mercadopago.server";
import {
  findOrCreateCustomer,
  createPaidOrder,
} from "../services/shopify.server";
import { unauthenticated } from "../shopify.server";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const preapprovalId = url.searchParams.get("preapproval_id");
  const status = url.searchParams.get("status");

  let subscription = null;
  if (preapprovalId) {
    subscription = await db.subscription.findFirst({
      where: { mpPreapprovalId: preapprovalId },
      include: { plan: true },
    });
  }

  if (subscription && preapprovalId) {
    try {
      const mpStatus = await getSubscriptionStatus(subscription.shop, preapprovalId);
      if (mpStatus.status === "authorized" && subscription.status !== "authorized") {
        await db.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "authorized",
            nextBillingDate: mpStatus.next_payment_date
              ? new Date(mpStatus.next_payment_date)
              : undefined,
          },
        });
        subscription = { ...subscription, status: "authorized" };

        // Create Shopify order if not already created
        if (!subscription.shopifyOrderId) {
          try {
            const { admin } = await unauthenticated.admin(subscription.shop);
            const nameParts = subscription.payerName.trim().split(/\s+/);
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";

            let customerId = subscription.shopifyCustomerId;
            if (!customerId) {
              customerId = await findOrCreateCustomer(admin, {
                email: subscription.payerEmail,
                firstName,
                lastName,
                phone: subscription.payerPhone || undefined,
              });
              if (customerId) {
                await db.subscription.update({
                  where: { id: subscription.id },
                  data: { shopifyCustomerId: customerId },
                });
              }
            }

            const order = await createPaidOrder(admin, {
              customerId,
              lineItemTitle: `${subscription.plan.name} (x${subscription.plan.quantity})`,
              amount: subscription.plan.amount,
              quantity: subscription.plan.quantity,
              note: `Suscripcion MercadoPago #${preapprovalId} - Primer pago`,
              email: subscription.payerEmail,
              currency: subscription.plan.currency,
              shippingAddress: {
                address1: subscription.shippingAddress,
                city: subscription.shippingCity,
                province: subscription.shippingProvince,
                zip: subscription.shippingPostalCode,
                country: "AR",
                firstName,
                lastName,
                phone: subscription.payerPhone || undefined,
              },
            });

            if (order) {
              await db.subscription.update({
                where: { id: subscription.id },
                data: { shopifyOrderId: order.id },
              });
              console.log(`Order created from callback: ${order.name}`);
            }
          } catch (orderError) {
            console.error("Error creating order from callback:", orderError);
          }
        }
      }
    } catch (e) {
      console.error("Error checking MP status on callback:", e);
    }
  }

  const isSuccess = status === "authorized" || subscription?.status === "authorized";

  // Validate shop domain format
  const shopDomain = subscription?.shop || "";
  const safeShopDomain = /^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shopDomain) ? shopDomain : "";

  const freqLabel: Record<string, string> = {
    months: "mes",
    days: "dias",
    weeks: "semanas",
  };

  const detailsHtml = subscription ? `
    <div class="details">
      <div><span class="label">Plan</span><span class="value">${esc(subscription.plan.name)}</span></div>
      <div><span class="label">Monto</span><span class="value">$${esc(subscription.plan.amount.toLocaleString())} / ${esc(freqLabel[subscription.plan.frequencyType] || subscription.plan.frequencyType)}</span></div>
      <div><span class="label">Cantidad</span><span class="value">${esc(String(subscription.plan.quantity))} un.</span></div>
      <div><span class="label">Envio a</span><span class="value">${esc(subscription.shippingAddress)}${subscription.shippingCity ? ", " + esc(subscription.shippingCity) : ""}</span></div>
    </div>` : "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${isSuccess ? "Suscripcion Activa" : "Suscripcion Pendiente"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #111; }
    p { font-size: 16px; color: #666; line-height: 1.5; margin-bottom: 20px; }
    .details { background: #f8f8f8; border-radius: 10px; padding: 16px; margin-bottom: 24px; text-align: left; }
    .details div { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .details .label { color: #888; }
    .details .value { font-weight: 600; color: #111; }
    .btn { display: inline-block; padding: 14px 32px; background: #2E7D32; color: #fff; text-decoration: none; border-radius: 10px; font-size: 16px; font-weight: 600; transition: opacity .2s; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? "&#x2705;" : "&#x23F3;"}</div>
    <h1>${isSuccess ? "&#161;Tu suscripcion esta activa!" : "Suscripcion pendiente"}</h1>
    <p>${isSuccess
      ? "Tu primer pago fue procesado exitosamente y tu pedido esta siendo preparado."
      : "Tu suscripcion esta siendo procesada. Te notificaremos cuando este confirmada."
    }</p>
    ${detailsHtml}
    ${safeShopDomain
      ? `<a class="btn" href="https://${safeShopDomain}">Volver a la tienda</a>`
      : `<p style="color:#888;font-size:14px;">Podes cerrar esta pagina.</p>`
    }
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
