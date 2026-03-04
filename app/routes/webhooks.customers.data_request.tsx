import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customerEmail =
    (payload as Record<string, any>)?.customer?.email || null;

  if (customerEmail) {
    const subscriptions = await db.subscription.findMany({
      where: { shop, payerEmail: customerEmail },
      select: {
        id: true,
        payerEmail: true,
        payerName: true,
        payerPhone: true,
        shippingAddress: true,
        shippingCity: true,
        shippingProvince: true,
        shippingPostalCode: true,
        status: true,
        createdAt: true,
      },
    });

    console.log(
      `Customer data request for ${customerEmail}: ${subscriptions.length} subscriptions found`,
    );
  }

  return new Response();
};
