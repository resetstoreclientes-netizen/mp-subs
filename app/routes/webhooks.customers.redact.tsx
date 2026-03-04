import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customerEmail =
    (payload as Record<string, any>)?.customer?.email || null;

  if (customerEmail) {
    const result = await db.subscription.updateMany({
      where: { shop, payerEmail: customerEmail },
      data: {
        payerEmail: "[REDACTED]",
        payerName: "[REDACTED]",
        payerPhone: "[REDACTED]",
        shippingAddress: "[REDACTED]",
        shippingCity: "[REDACTED]",
        shippingProvince: "[REDACTED]",
        shippingPostalCode: "[REDACTED]",
      },
    });

    console.log(
      `Customer redact for ${customerEmail}: ${result.count} subscriptions anonymized`,
    );
  }

  return new Response();
};
