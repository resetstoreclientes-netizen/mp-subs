import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Tabs,
  TextField,
  IndexTable,
  Pagination,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback, useMemo } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { id: "all", content: "Todas" },
  { id: "authorized", content: "Activas" },
  { id: "paused", content: "Pausadas" },
  { id: "cancelled", content: "Canceladas" },
  { id: "payment_failed", content: "Problemas de cobro" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("q") || "";
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  const where: Record<string, unknown> = { shop };

  if (statusFilter === "payment_failed") {
    // Find subscriptions that have payment_failed events
    const failedSubIds = await db.subscriptionEvent.findMany({
      where: { shop, type: "payment_failed" },
      select: { subscriptionId: true },
      distinct: ["subscriptionId"],
    });
    where.id = { in: failedSubIds.map((e) => e.subscriptionId) };
  } else if (statusFilter !== "all") {
    where.status = statusFilter;
  }

  if (search) {
    where.OR = [
      { payerEmail: { contains: search, mode: "insensitive" } },
      { payerName: { contains: search, mode: "insensitive" } },
      { shippingCity: { contains: search, mode: "insensitive" } },
    ];
  }

  const [subscriptions, totalCount, statusCounts] = await Promise.all([
    db.subscription.findMany({
      where,
      include: { plan: { select: { name: true, amount: true, currency: true, frequencyType: true, frequency: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.subscription.count({ where }),
    // Count by status for tab badges
    Promise.all([
      db.subscription.count({ where: { shop } }),
      db.subscription.count({ where: { shop, status: "authorized" } }),
      db.subscription.count({ where: { shop, status: "paused" } }),
      db.subscription.count({ where: { shop, status: "cancelled" } }),
      db.subscriptionEvent.findMany({
        where: { shop, type: "payment_failed" },
        select: { subscriptionId: true },
        distinct: ["subscriptionId"],
      }),
    ]),
  ]);

  const counts = {
    all: statusCounts[0],
    authorized: statusCounts[1],
    paused: statusCounts[2],
    cancelled: statusCounts[3],
    payment_failed: statusCounts[4].length,
  };

  return json({
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      payerEmail: s.payerEmail,
      payerName: s.payerName,
      payerPhone: s.payerPhone,
      shippingCity: s.shippingCity,
      shippingAddress: s.shippingAddress,
      shippingProvince: s.shippingProvince,
      planName: s.plan.name,
      planAmount: s.plan.amount,
      planCurrency: s.plan.currency,
      planFrequencyType: s.plan.frequencyType,
      planFrequency: s.plan.frequency,
      status: s.status,
      mpPreapprovalId: s.mpPreapprovalId,
      createdAt: s.createdAt,
    })),
    totalCount,
    counts,
    page,
    statusFilter,
    search,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  });
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { tone: "success" | "attention" | "critical" | "info"; label: string }> = {
    authorized: { tone: "success", label: "Activa" },
    pending: { tone: "attention", label: "Pendiente" },
    cancelled: { tone: "critical", label: "Cancelada" },
    paused: { tone: "info", label: "Pausada" },
  };
  const c = config[status] || { tone: "info" as const, label: status };
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

export default function SubscriptionsPage() {
  const {
    subscriptions,
    totalCount,
    counts,
    page,
    statusFilter,
    search,
    totalPages,
  } = useLoaderData<typeof loader>();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(search);

  const selectedTab = STATUS_TABS.findIndex((t) => t.id === statusFilter);

  const handleTabChange = useCallback(
    (index: number) => {
      const newStatus = STATUS_TABS[index].id;
      const params = new URLSearchParams(searchParams);
      params.set("status", newStatus);
      params.delete("page");
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("q", searchValue);
    } else {
      params.delete("q");
    }
    params.delete("page");
    setSearchParams(params);
  }, [searchValue, searchParams, setSearchParams]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch],
  );

  const handleClearSearch = useCallback(() => {
    setSearchValue("");
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    params.delete("page");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const goToPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(newPage));
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const freqMap: Record<string, string> = {
    months: "mes",
    days: "dia",
    weeks: "sem",
  };

  const tabs = useMemo(
    () =>
      STATUS_TABS.map((tab) => ({
        ...tab,
        content: `${tab.content} (${counts[tab.id as keyof typeof counts]})`,
      })),
    [counts],
  );

  return (
    <Page>
      <TitleBar title="Suscripciones" />
      <BlockStack gap="400">
        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
            <Box padding="400">
              <BlockStack gap="400">
                {/* Search */}
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ flex: 1 }} onKeyDown={handleSearchKeyDown}>
                    <TextField
                      label=""
                      labelHidden
                      value={searchValue}
                      onChange={setSearchValue}
                      placeholder="Buscar por email, nombre o ciudad..."
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={handleClearSearch}
                    />
                  </div>
                </InlineStack>

                {/* Results */}
                {subscriptions.length === 0 ? (
                  <EmptyState
                    heading="No se encontraron suscripciones"
                    image=""
                  >
                    <p>
                      {search
                        ? `No hay resultados para "${search}". Proba con otro termino.`
                        : "Los contratos de suscripcion se mostraran aca."}
                    </p>
                  </EmptyState>
                ) : (
                  <>
                    <IndexTable
                      itemCount={subscriptions.length}
                      headings={[
                        { title: "Cliente" },
                        { title: "Plan" },
                        { title: "Monto" },
                        { title: "Ciudad" },
                        { title: "Estado" },
                        { title: "Fecha" },
                      ]}
                      selectable={false}
                    >
                      {subscriptions.map((sub, index) => (
                        <IndexTable.Row
                          id={sub.id}
                          key={sub.id}
                          position={index}
                        >
                          <IndexTable.Cell>
                            <BlockStack gap="100">
                              <Text
                                variant="bodyMd"
                                fontWeight="bold"
                                as="span"
                              >
                                {sub.payerName || sub.payerEmail}
                              </Text>
                              {sub.payerName && (
                                <Text
                                  variant="bodySm"
                                  tone="subdued"
                                  as="span"
                                >
                                  {sub.payerEmail}
                                </Text>
                              )}
                            </BlockStack>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <BlockStack gap="100">
                              <Text variant="bodyMd" as="span">
                                {sub.planName}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                cada {sub.planFrequency}{" "}
                                {freqMap[sub.planFrequencyType] ||
                                  sub.planFrequencyType}
                              </Text>
                            </BlockStack>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                              ${sub.planAmount.toLocaleString()}{" "}
                              {sub.planCurrency}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {sub.shippingCity || "—"}
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <StatusBadge status={sub.status} />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {new Date(sub.createdAt).toLocaleDateString(
                              "es-AR",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                    </IndexTable>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <Box paddingBlockStart="400">
                        <InlineStack align="center">
                          <Pagination
                            hasPrevious={page > 1}
                            hasNext={page < totalPages}
                            onPrevious={() => goToPage(page - 1)}
                            onNext={() => goToPage(page + 1)}
                          />
                        </InlineStack>
                        <Box paddingBlockStart="200">
                          <Text
                            as="p"
                            variant="bodySm"
                            tone="subdued"
                            alignment="center"
                          >
                            {totalCount} suscripciones en total — Pagina {page}{" "}
                            de {totalPages}
                          </Text>
                        </Box>
                      </Box>
                    )}
                  </>
                )}
              </BlockStack>
            </Box>
          </Tabs>
        </Card>
      </BlockStack>
    </Page>
  );
}
