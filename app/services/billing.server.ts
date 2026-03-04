import { unauthenticated } from "../shopify.server";

const USAGE_RECORD_QUERY = `#graphql
  query appSubscription {
    currentAppInstallation {
      activeSubscriptions {
        id
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppUsagePricing {
                cappedAmount {
                  amount
                }
                terms
              }
            }
          }
        }
      }
    }
  }
`;

const USAGE_RECORD_MUTATION = `#graphql
  mutation appUsageRecordCreate($subscriptionLineItemId: ID!, $price: MoneyInput!, $description: String!) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      price: $price
      description: $description
    ) {
      appUsageRecord {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function getUsageSubscriptionLineItemId(
  admin: { graphql: Function },
): Promise<string | null> {
  const response = await admin.graphql(USAGE_RECORD_QUERY);
  const json = (await response.json()) as Record<string, any>;

  const subscriptions =
    json.data?.currentAppInstallation?.activeSubscriptions;
  if (!subscriptions || subscriptions.length === 0) return null;

  // Find the usage line item
  for (const sub of subscriptions) {
    for (const lineItem of sub.lineItems) {
      const pricing = lineItem.plan?.pricingDetails;
      if (pricing?.cappedAmount) {
        return lineItem.id;
      }
    }
  }

  return null;
}

// Porcentaje que cobramos por cada suscripción creada
const USAGE_PERCENTAGE = 0.04; // 4%

export async function recordSubscriptionUsage(
  shop: string,
  subscriptionAmount: number,
): Promise<void> {
  try {
    const { admin } = await unauthenticated.admin(shop);

    const lineItemId = await getUsageSubscriptionLineItemId(admin);
    if (!lineItemId) {
      console.error(`No usage billing line item found for shop: ${shop}`);
      return;
    }

    // Calcular 2% del monto de la suscripción
    const chargeAmount = Math.round(subscriptionAmount * USAGE_PERCENTAGE * 100) / 100;
    if (chargeAmount <= 0) {
      console.log(`Skipping usage record: charge amount is $${chargeAmount}`);
      return;
    }

    const response = await admin.graphql(USAGE_RECORD_MUTATION, {
      variables: {
        subscriptionLineItemId: lineItemId,
        price: {
          amount: chargeAmount,
          currencyCode: "USD",
        },
        description: `4% comision por suscripcion de $${subscriptionAmount} USD`,
      },
    });

    const json = (await response.json()) as Record<string, any>;

    if (json.data?.appUsageRecordCreate?.userErrors?.length > 0) {
      console.error(
        "Usage record errors:",
        json.data.appUsageRecordCreate.userErrors,
      );
      return;
    }

    console.log(
      `Usage record created for ${shop}:`,
      json.data?.appUsageRecordCreate?.appUsageRecord?.id,
    );
  } catch (error) {
    console.error(`Failed to record usage for ${shop}:`, error);
  }
}
