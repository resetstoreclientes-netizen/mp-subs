import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  Box,
  Banner,
  IndexTable,
  Badge,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [settings, plans, subscriptions, recentSubs] = await Promise.all([
    db.settings.findUnique({ where: { shop: session.shop } }),
    db.plan.findMany({ where: { shop: session.shop } }),
    db.subscription.findMany({ where: { shop: session.shop } }),
    db.subscription.findMany({
      where: { shop: session.shop },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const totalPlans = plans.length;
  const activePlans = plans.filter((p) => p.active).length;
  const totalSubscriptions = subscriptions.length;
  const activeSubscriptions = subscriptions.filter(
    (s) => s.status === "authorized",
  ).length;
  const pendingSubscriptions = subscriptions.filter(
    (s) => s.status === "pending",
  ).length;
  const isConfigured = !!settings?.mpAccessToken;

  return json({
    isConfigured,
    totalPlans,
    activePlans,
    totalSubscriptions,
    activeSubscriptions,
    pendingSubscriptions,
    recentSubs,
  });
};

function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, "success" | "attention" | "critical" | "info" | undefined> = {
    authorized: "success",
    pending: "attention",
    cancelled: "critical",
    paused: "info",
  };
  return <Badge tone={toneMap[status]}>{status}</Badge>;
}

export default function Dashboard() {
  const {
    isConfigured,
    totalPlans,
    activePlans,
    totalSubscriptions,
    activeSubscriptions,
    pendingSubscriptions,
    recentSubs,
  } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="MP Suscripciones" />
      <BlockStack gap="500">
        {!isConfigured && (
          <Banner tone="warning" action={{ content: "Ir a Settings", url: "/app/settings" }}>
            <p>
              MercadoPago no esta configurado. Ingresa tus credenciales para
              empezar a recibir suscripciones.
            </p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <InlineGrid columns={3} gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Planes activos
                  </Text>
                  <Text as="p" variant="headingXl">
                    {activePlans}/{totalPlans}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Suscripciones activas
                  </Text>
                  <Text as="p" variant="headingXl">
                    {activeSubscriptions}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Pendientes
                  </Text>
                  <Text as="p" variant="headingXl">
                    {pendingSubscriptions}
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Suscripciones recientes
                </Text>
                {recentSubs.length === 0 ? (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No hay suscripciones todavia.
                  </Text>
                ) : (
                  <IndexTable
                    itemCount={recentSubs.length}
                    headings={[
                      { title: "Email" },
                      { title: "Plan" },
                      { title: "Monto" },
                      { title: "Estado" },
                      { title: "Fecha" },
                    ]}
                    selectable={false}
                  >
                    {recentSubs.map((sub, index) => (
                      <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                        <IndexTable.Cell>
                          <Text variant="bodyMd" fontWeight="bold" as="span">
                            {sub.payerEmail}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{sub.plan.name}</IndexTable.Cell>
                        <IndexTable.Cell>
                          ${sub.plan.amount} {sub.plan.currency}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <StatusBadge status={sub.status} />
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
