import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import db from "../db.server";
import { getSubscriptionStatus } from "../services/mercadopago.server";
import {
  findOrCreateCustomer,
  createPaidOrder,
} from "../services/shopify.server";
import { unauthenticated } from "../shopify.server";

function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string | null,
): boolean {
  if (!secret || !signature) return true;

  const parts = signature.split(",");
  const tsEntry = parts.find((p) => p.trim().startsWith("ts="));
  const v1Entry = parts.find((p) => p.trim().startsWith("v1="));

  if (!tsEntry || !v1Entry) return false;

  const ts = tsEntry.split("=")[1];
  const hash = v1Entry.split("=")[1];

  const manifest = `id:;request-id:;ts:${ts};${body}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return hash === expected;
}

async function createShopifyOrder(
  shop: string,
  subscription: {
    id: string;
    payerEmail: string;
    payerName: string;
    payerPhone: string;
    shippingAddress: string;
    shippingCity: string;
    shippingProvince: string;
    shippingPostalCode: string;
    shopifyCustomerId: string | null;
    plan: {
      name: string;
      amount: number;
      quantity: number;
      currency: string;
    };
  },
  preapprovalId: string,
  isRecurring: boolean,
) {
  const { admin } = await unauthenticated.admin(shop);

  // Parse name into first/last
  const nameParts = subscription.payerName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // Find or create customer
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

  const orderNote = isRecurring
    ? `Suscripcion recurrente MercadoPago #${preapprovalId}`
    : `Suscripcion MercadoPago #${preapprovalId} - Primer pago`;

  const order = await createPaidOrder(admin, {
    customerId,
    lineItemTitle: `${subscription.plan.name} (x${subscription.plan.quantity})`,
    amount: subscription.plan.amount,
    quantity: subscription.plan.quantity,
    note: orderNote,
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

  if (!order) {
    console.error("Failed to create order for subscription:", subscription.id);
    return null;
  }

  console.log(`Order created: ${order.name} (${order.id})`);
  return order;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.text();
  let payload: {
    action?: string;
    type?: string;
    data?: { id?: string };
    id?: string;
  };

  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("MercadoPago webhook received:", JSON.stringify(payload));

  const preapprovalId = payload.data?.id || payload.id;
  if (!preapprovalId) {
    return json({ received: true });
  }

  // Find the subscription by MP preapproval ID
  const subscription = await db.subscription.findFirst({
    where: { mpPreapprovalId: preapprovalId.toString() },
    include: { plan: true },
  });

  if (!subscription) {
    console.log(`No subscription found for preapproval: ${preapprovalId}`);
    return json({ received: true });
  }

  // Verify signature
  const settings = await db.settings.findUnique({
    where: { shop: subscription.shop },
  });

  const signature = request.headers.get("x-signature");
  if (
    settings?.webhookSecret &&
    !verifyWebhookSignature(body, signature, settings.webhookSecret)
  ) {
    console.error("Invalid webhook signature");
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const mpStatus = await getSubscriptionStatus(
      subscription.shop,
      preapprovalId.toString(),
    );

    const newStatus = mpStatus.status || subscription.status;

    // Update subscription status
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus,
        nextBillingDate: mpStatus.next_payment_date
          ? new Date(mpStatus.next_payment_date)
          : undefined,
      },
    });

    // First payment: subscription just became authorized
    if (newStatus === "authorized" && subscription.status !== "authorized") {
      console.log(
        `Subscription ${subscription.id} authorized. Creating first Shopify order.`,
      );

      try {
        const order = await createShopifyOrder(
          subscription.shop,
          subscription,
          preapprovalId.toString(),
          false,
        );

        if (order) {
          await db.subscription.update({
            where: { id: subscription.id },
            data: { shopifyOrderId: order.id },
          });
          console.log(`First order linked: ${order.id}`);
        }
      } catch (orderError) {
        console.error("Error creating first Shopify order:", orderError);
      }
    }

    // Recurring payment: subscription is already authorized and we got a new payment notification
    if (
      newStatus === "authorized" &&
      subscription.status === "authorized" &&
      payload.type === "subscription_authorized_payment"
    ) {
      console.log(
        `Recurring payment for subscription ${subscription.id}. Creating new Shopify order.`,
      );

      try {
        const order = await createShopifyOrder(
          subscription.shop,
          subscription,
          preapprovalId.toString(),
          true,
        );

        if (order) {
          // Update with latest order ID
          await db.subscription.update({
            where: { id: subscription.id },
            data: { shopifyOrderId: order.id },
          });
          console.log(`Recurring order created: ${order.id}`);
        }
      } catch (orderError) {
        console.error("Error creating recurring Shopify order:", orderError);
      }
    }

    return json({ received: true, status: newStatus });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return json({ error: "Processing failed" }, { status: 500 });
  }
};
