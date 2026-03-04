import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export async function createSellingPlanGroup(
  admin: AdminApiContext,
  plan: {
    name: string;
    description: string;
    amount: number;
    currency: string;
    frequencyType: string;
    frequency: number;
    trialDays: number;
  },
) {
  const intervalMap: Record<string, string> = {
    days: "DAY",
    weeks: "WEEK",
    months: "MONTH",
    years: "YEAR",
  };

  const deliveryInterval = intervalMap[plan.frequencyType] || "MONTH";

  const response = await admin.graphql(
    `#graphql
    mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {
      sellingPlanGroupCreate(input: $input) {
        sellingPlanGroup {
          id
          sellingPlans(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          name: plan.name,
          merchantCode: "subscribe-and-save",
          options: ["Subscription"],
          sellingPlansToCreate: [
            {
              name: `${plan.name} - Every ${plan.frequency} ${plan.frequencyType}`,
              category: "SUBSCRIPTION",
              billingPolicy: {
                recurring: {
                  interval: deliveryInterval,
                  intervalCount: plan.frequency,
                },
              },
              deliveryPolicy: {
                recurring: {
                  interval: deliveryInterval,
                  intervalCount: plan.frequency,
                },
              },
              pricingPolicies: [
                {
                  fixed: {
                    adjustmentType: "PRICE",
                    adjustmentValue: {
                      fixedValue: plan.amount,
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  );

  const json = await response.json();

  if (json.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
    throw new Error(
      json.data.sellingPlanGroupCreate.userErrors
        .map((e: { message: string }) => e.message)
        .join(", "),
    );
  }

  const group = json.data?.sellingPlanGroupCreate?.sellingPlanGroup;
  return {
    sellingPlanGroupId: group?.id,
    sellingPlanId: group?.sellingPlans?.edges?.[0]?.node?.id,
  };
}

export async function deleteSellingPlanGroup(
  admin: AdminApiContext,
  sellingPlanGroupId: string,
) {
  const response = await admin.graphql(
    `#graphql
    mutation sellingPlanGroupDelete($id: ID!) {
      sellingPlanGroupDelete(id: $id) {
        deletedSellingPlanGroupId
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: { id: sellingPlanGroupId },
    },
  );

  const json = await response.json();
  return json.data?.sellingPlanGroupDelete;
}

export async function addProductToSellingPlanGroup(
  admin: AdminApiContext,
  sellingPlanGroupId: string,
  productId: string,
) {
  const response = await admin.graphql(
    `#graphql
    mutation sellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
      sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
        sellingPlanGroup {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        id: sellingPlanGroupId,
        productIds: [productId],
      },
    },
  );

  const json = await response.json();
  return json.data?.sellingPlanGroupAddProducts;
}

export async function findOrCreateCustomer(
  admin: AdminApiContext,
  {
    email,
    firstName,
    lastName,
    phone,
  }: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  },
) {
  // Search for existing customer by email
  const searchResponse = await admin.graphql(
    `#graphql
    query customerSearch($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
          }
        }
      }
    }`,
    { variables: { query: `email:${email}` } },
  );

  const searchJson = await searchResponse.json();
  const existing = searchJson.data?.customers?.edges?.[0]?.node;
  if (existing) return existing.id;

  // Create new customer
  const createResponse = await admin.graphql(
    `#graphql
    mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          email,
          firstName,
          lastName,
          ...(phone ? { phone } : {}),
        },
      },
    },
  );

  const createJson = await createResponse.json();
  return createJson.data?.customerCreate?.customer?.id || null;
}

export async function createPaidOrder(
  admin: AdminApiContext,
  {
    customerId,
    lineItemTitle,
    amount,
    quantity,
    note,
    shippingAddress,
    email,
    currency,
  }: {
    customerId?: string | null;
    lineItemTitle: string;
    amount: number;
    quantity: number;
    note: string;
    shippingAddress?: {
      address1: string;
      city: string;
      province: string;
      zip: string;
      country: string;
      firstName: string;
      lastName: string;
      phone?: string;
    };
    email?: string;
    currency?: string;
  },
) {
  const lineItems = [
    {
      title: lineItemTitle,
      priceSet: {
        shopMoney: {
          amount: String(amount),
          currencyCode: currency || "ARS",
        },
      },
      quantity,
    },
  ];

  const order: Record<string, unknown> = {
    lineItems,
    note,
    financialStatus: "PAID",
    currency: currency || "ARS",
  };

  if (customerId) {
    order.customerId = customerId;
  }
  if (email) {
    order.email = email;
  }
  if (shippingAddress) {
    order.shippingAddress = {
      address1: shippingAddress.address1,
      city: shippingAddress.city,
      provinceCode: shippingAddress.province,
      zip: shippingAddress.zip,
      countryCode: shippingAddress.country,
      firstName: shippingAddress.firstName,
      lastName: shippingAddress.lastName,
      ...(shippingAddress.phone ? { phone: shippingAddress.phone } : {}),
    };
  }

  const response = await admin.graphql(
    `#graphql
    mutation orderCreate($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        order {
          id
          name
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { order } },
  );

  const json = await response.json() as Record<string, any>;

  if (json.data?.orderCreate?.userErrors?.length > 0) {
    console.error("Order create errors:", json.data.orderCreate.userErrors);
    return null;
  }

  if (!json.data?.orderCreate?.order) {
    console.error("Order create failed:", JSON.stringify(json));
    return null;
  }

  return json.data.orderCreate.order;
}
