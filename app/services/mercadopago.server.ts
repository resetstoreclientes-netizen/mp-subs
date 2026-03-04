import { MercadoPagoConfig, PreApproval } from "mercadopago";
import db from "../db.server";

export async function getMercadoPagoClient(shop: string) {
  const settings = await db.settings.findUnique({ where: { shop } });
  if (!settings) {
    throw new Error(`MercadoPago not configured for shop: ${shop}`);
  }

  const client = new MercadoPagoConfig({
    accessToken: settings.mpAccessToken,
  });

  return { client, settings };
}

export async function createSubscription({
  shop,
  planName,
  amount,
  currency,
  frequencyType,
  frequency,
  payerEmail,
  backUrl,
  notificationUrl,
  trialDays,
}: {
  shop: string;
  planName: string;
  amount: number;
  currency: string;
  frequencyType: string;
  frequency: number;
  payerEmail: string;
  backUrl: string;
  notificationUrl?: string;
  trialDays?: number;
}) {
  const { client } = await getMercadoPagoClient(shop);
  const preApproval = new PreApproval(client);

  const body: Record<string, unknown> = {
    back_url: backUrl,
    reason: planName,
    auto_recurring: {
      frequency,
      frequency_type: frequencyType,
      transaction_amount: amount,
      currency_id: currency,
    },
    payer_email: payerEmail,
  };

  if (notificationUrl) {
    body.notification_url = notificationUrl;
  }

  if (trialDays && trialDays > 0) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    (body.auto_recurring as Record<string, unknown>).free_trial = {
      frequency: trialDays,
      frequency_type: "days",
    };
  }

  const response = await preApproval.create({ body });
  return response;
}

export async function getSubscriptionStatus(
  shop: string,
  preapprovalId: string,
) {
  const { client } = await getMercadoPagoClient(shop);
  const preApproval = new PreApproval(client);

  const response = await preApproval.get({ id: preapprovalId });
  return response;
}

export async function cancelSubscription(
  shop: string,
  preapprovalId: string,
) {
  const { client } = await getMercadoPagoClient(shop);
  const preApproval = new PreApproval(client);

  const response = await preApproval.update({
    id: preapprovalId,
    body: { status: "cancelled" },
  });
  return response;
}
