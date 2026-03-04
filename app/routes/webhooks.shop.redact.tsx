import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Delete all shop data in FK order
  const deletedSubscriptions = await db.subscription.deleteMany({
    where: { shop },
  });
  console.log(`Deleted ${deletedSubscriptions.count} subscriptions`);

  const deletedPlans = await db.plan.deleteMany({ where: { shop } });
  console.log(`Deleted ${deletedPlans.count} plans`);

  const deletedSettings = await db.settings.deleteMany({ where: { shop } });
  console.log(`Deleted ${deletedSettings.count} settings`);

  const deletedSessions = await db.session.deleteMany({ where: { shop } });
  console.log(`Deleted ${deletedSessions.count} sessions`);

  console.log(`Shop redact complete for ${shop}`);
  return new Response();
};
