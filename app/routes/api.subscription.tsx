import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { createSubscription } from "../services/mercadopago.server";
import { recordSubscriptionUsage } from "../services/billing.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle CORS preflight
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalido" }, { status: 400, headers: corsHeaders });
  }

  const { planId, shop, email, name, phone, address, city, province, postalCode, productTitle, appUrl } = body;

  if (!planId || !shop || !email || !name || !address || !city) {
    return json({ error: "Faltan datos obligatorios" }, { status: 400, headers: corsHeaders });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Email invalido" }, { status: 400, headers: corsHeaders });
  }

  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) {
    return json({ error: "Plan no encontrado o inactivo" }, { status: 404, headers: corsHeaders });
  }

  // Verify plan belongs to this shop
  if (plan.shop !== shop) {
    return json({ error: "Plan no pertenece a esta tienda" }, { status: 403, headers: corsHeaders });
  }

  const settings = await db.settings.findUnique({ where: { shop } });
  if (!settings) {
    return json(
      { error: "MercadoPago no configurado para esta tienda" },
      { status: 500, headers: corsHeaders },
    );
  }

  try {
    const baseUrl = appUrl || process.env.SHOPIFY_APP_URL || "";
    const backUrl = `${baseUrl}/api/subscription/callback`;
    const notificationUrl = `${baseUrl}/webhooks/mercadopago`;

    const mpSubscription = await createSubscription({
      shop,
      planName: `${plan.name} - ${productTitle || "Suscripcion"}`,
      amount: plan.amount,
      currency: plan.currency,
      frequencyType: plan.frequencyType,
      frequency: plan.frequency,
      payerEmail: email,
      backUrl,
      notificationUrl,
      trialDays: plan.trialDays,
    });

    await db.subscription.create({
      data: {
        shop,
        planId: plan.id,
        mpPreapprovalId: mpSubscription.id?.toString() || null,
        mpInitPoint: mpSubscription.init_point || null,
        status: "pending",
        payerEmail: email,
        payerName: name,
        payerPhone: phone || "",
        shippingAddress: address,
        shippingCity: city,
        shippingProvince: province || "",
        shippingPostalCode: postalCode || "",
      },
    });

    // Cobrar 4% del monto de la suscripción al merchant
    recordSubscriptionUsage(shop, plan.amount).catch((err) =>
      console.error("Usage billing error:", err),
    );

    return json({
      success: true,
      initPoint: mpSubscription.init_point,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error creating subscription:", error);
    let errMsg: string;
    if (error instanceof Error) {
      errMsg = error.message;
    } else if (typeof error === "object" && error !== null) {
      errMsg = JSON.stringify(error);
    } else {
      errMsg = String(error);
    }
    return json(
      { error: `Error al crear la suscripcion: ${errMsg}` },
      { status: 500, headers: corsHeaders },
    );
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Handle preflight from loader too
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "shop parameter required" }, { status: 400, headers: corsHeaders });
  }

  const plans = await db.plan.findMany({
    where: { shop, active: true },
    select: {
      id: true,
      name: true,
      description: true,
      amount: true,
      originalPrice: true,
      quantity: true,
      currency: true,
      frequencyType: true,
      frequency: true,
      trialDays: true,
    },
    orderBy: { amount: "asc" },
  });

  return json({ plans }, { headers: corsHeaders });
};
