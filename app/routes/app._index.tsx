import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  IndexTable,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { KpiCard } from "../components/charts/KpiCard";
import { RevenueChart } from "../components/charts/RevenueChart";
import { PlanDistribution } from "../components/charts/PlanDistribution";
import { StatusDonut } from "../components/charts/StatusDonut";
import { ActivityFeed } from "../components/charts/ActivityFeed";
import { SetupGuide } from "../components/charts/SetupGuide";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    settings,
    allSubscriptions,
    recentSubs,
    recentEvents,
    paymentEvents,
    newThisMonth,
    newLastMonth,
    cancelledThisMonth,
    plansCount,
  ] = await Promise.all([
    db.settings.findUnique({ where: { shop } }),

    db.subscription.findMany({
      where: { shop },
      include: { plan: true },
    }),

    db.subscription.findMany({
      where: { shop },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),

    db.subscriptionEvent.findMany({
      where: { shop },
      include: { subscription: { select: { payerEmail: true, plan: { select: { name: true, amount: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),

    db.subscriptionEvent.findMany({
      where: { shop, type: "payment" },
      select: { amount: true, createdAt: true },
    }),

    db.subscription.count({
      where: { shop, createdAt: { gte: firstDayThisMonth } },
    }),

    db.subscription.count({
      where: {
        shop,
        createdAt: { gte: firstDayLastMonth, lte: lastDayLastMonth },
      },
    }),

    db.subscriptionEvent.count({
      where: { shop, type: "cancelled", createdAt: { gte: firstDayThisMonth } },
    }),

    db.plan.count({ where: { shop } }),
  ]);

  const isConfigured = !!settings?.mpAccessToken;

  // KPI: MRR
  const activeSubs = allSubscriptions.filter((s) => s.status === "authorized");
  const mrr = activeSubs.reduce((sum, s) => sum + s.plan.amount, 0);

  const subsAtStartOfMonth = allSubscriptions.filter(
    (s) => s.createdAt < firstDayThisMonth && s.status === "authorized",
  );
  const previousMrr = subsAtStartOfMonth.reduce((sum, s) => sum + s.plan.amount, 0);

  // Churn
  const activeAtStartOfMonth = allSubscriptions.filter(
    (s) =>
      s.createdAt < firstDayThisMonth &&
      (s.status === "authorized" || s.status === "cancelled"),
  ).length;
  const churnRate =
    activeAtStartOfMonth > 0
      ? (cancelledThisMonth / activeAtStartOfMonth) * 100
      : 0;

  // Revenue
  const totalRevenue = paymentEvents.reduce((sum, e) => sum + (e.amount || 0), 0);

  // ARPU (Average Revenue Per User)
  const arpu = activeSubs.length > 0 ? totalRevenue / activeSubs.length : 0;

  // Average subscription age (days)
  const avgAgeDays =
    activeSubs.length > 0
      ? activeSubs.reduce((sum, s) => {
          const days = (now.getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / activeSubs.length
      : 0;

  // Upcoming collections next 30 days (estimated: active subs * plan amount)
  const upcomingCollections = activeSubs.reduce((sum, s) => sum + s.plan.amount, 0);

  // Average lifetime revenue per subscriber
  const avgLifetimeRevenue =
    allSubscriptions.length > 0 ? totalRevenue / allSubscriptions.length : 0;

  // Revenue por mes (6 meses)
  const revenueByMonth: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthRevenue = paymentEvents
      .filter((e) => e.createdAt >= d && e.createdAt < nextD)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    const monthLabel = d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
    revenueByMonth.push({ month: monthLabel, revenue: monthRevenue });
  }

  // Subs por plan
  const planCounts: Record<string, { name: string; count: number }> = {};
  for (const sub of activeSubs) {
    if (!planCounts[sub.planId]) {
      planCounts[sub.planId] = { name: sub.plan.name, count: 0 };
    }
    planCounts[sub.planId].count++;
  }
  const subsByPlan = Object.values(planCounts).sort((a, b) => b.count - a.count);

  // Subs por estado
  const statusCounts: Record<string, number> = {};
  for (const sub of allSubscriptions) {
    statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
  }
  const subsByStatus = [
    { name: "Activas", value: statusCounts["authorized"] || 0, color: "#10b981" },
    { name: "Pendientes", value: statusCounts["pending"] || 0, color: "#f59e0b" },
    { name: "Canceladas", value: statusCounts["cancelled"] || 0, color: "#ef4444" },
    { name: "Pausadas", value: statusCounts["paused"] || 0, color: "#6366f1" },
  ];

  // Top ciudades
  const cityCounts: Record<string, number> = {};
  for (const sub of allSubscriptions) {
    const city = sub.shippingCity?.trim();
    if (city) {
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    }
  }
  const topCities = Object.entries(cityCounts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxCityCount = topCities[0]?.count || 1;

  // Activity feed
  const activityFeed = recentEvents.map((evt) => {
    let description = "";
    const email = evt.subscription?.payerEmail || "desconocido";
    const planName = evt.subscription?.plan?.name || "";
    const amount = evt.subscription?.plan?.amount || 0;

    switch (evt.type) {
      case "created":
        description = `Nueva suscripcion de ${email}`;
        break;
      case "authorized":
        description = `Suscripcion autorizada — ${email}`;
        break;
      case "payment":
        description = `Pago recibido — ${planName} — $${amount.toLocaleString("es-AR")}`;
        break;
      case "cancelled":
        description = `Suscripcion cancelada — ${email}`;
        break;
      case "paused":
        description = `Suscripcion pausada — ${email}`;
        break;
      case "payment_failed":
        description = `Pago fallido — ${email}`;
        break;
      default:
        description = `${evt.type} — ${email}`;
    }

    return {
      id: evt.id,
      type: evt.type,
      description,
      date: evt.createdAt.toISOString(),
    };
  });

  const setupState = {
    hasMercadoPago: isConfigured,
    hasPlans: plansCount > 0,
    hasFirstSale: allSubscriptions.length > 0,
  };
  const setupComplete =
    setupState.hasMercadoPago && setupState.hasPlans && setupState.hasFirstSale;

  return json({
    isConfigured,
    setupState,
    setupComplete,
    mrr,
    previousMrr,
    activeSubsCount: activeSubs.length,
    previousActiveCount: subsAtStartOfMonth.length,
    newThisMonth,
    newLastMonth,
    churnRate,
    totalRevenue,
    arpu,
    avgAgeDays: Math.round(avgAgeDays),
    upcomingCollections,
    avgLifetimeRevenue,
    revenueByMonth,
    subsByPlan,
    subsByStatus,
    topCities,
    maxCityCount,
    activityFeed,
    recentSubs: recentSubs.map((s) => ({
      id: s.id,
      payerEmail: s.payerEmail,
      payerName: s.payerName,
      shippingCity: s.shippingCity,
      planName: s.plan.name,
      amount: s.plan.amount,
      currency: s.plan.currency,
      status: s.status,
      createdAt: s.createdAt,
    })),
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

export default function Dashboard() {
  const {
    isConfigured,
    setupState,
    setupComplete,
    mrr,
    previousMrr,
    activeSubsCount,
    previousActiveCount,
    newThisMonth,
    newLastMonth,
    churnRate,
    totalRevenue,
    arpu,
    avgAgeDays,
    upcomingCollections,
    avgLifetimeRevenue,
    revenueByMonth,
    subsByPlan,
    subsByStatus,
    topCities,
    maxCityCount,
    activityFeed,
    recentSubs,
  } = useLoaderData<typeof loader>();

  const [themeSetupDone, setThemeSetupDone] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("mp-subs-theme-setup-done");
    if (stored === "true") setThemeSetupDone(true);
  }, []);

  const handleMarkThemeDone = () => {
    localStorage.setItem("mp-subs-theme-setup-done", "true");
    setThemeSetupDone(true);
  };

  const allSetupDone = setupComplete && themeSetupDone;

  return (
    <Page>
      <TitleBar title="MP Suscripciones" />
      <BlockStack gap="500">
        {!allSetupDone && (
          <SetupGuide
            hasMercadoPago={setupState.hasMercadoPago}
            hasPlans={setupState.hasPlans}
            hasThemeSetup={themeSetupDone}
            hasFirstSale={setupState.hasFirstSale}
            onMarkThemeDone={handleMarkThemeDone}
          />
        )}

        {/* KPI Cards */}
        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          <KpiCard
            title="MRR"
            value={mrr}
            format="currency"
            accent="green"
            icon="revenue"
            currentValue={mrr}
            previousValue={previousMrr}
            subtitle="por mes"
          />
          <KpiCard
            title="Suscripciones activas"
            value={activeSubsCount}
            accent="blue"
            icon="users"
            currentValue={activeSubsCount}
            previousValue={previousActiveCount}
          />
          <KpiCard
            title="Nuevas este mes"
            value={newThisMonth}
            accent="purple"
            icon="new"
            currentValue={newThisMonth}
            previousValue={newLastMonth}
          />
          <KpiCard
            title="Tasa de cancelacion"
            value={churnRate}
            format="percent"
            accent="amber"
            icon="churn"
            invertTrend
            subtitle={churnRate === 0 ? "sin cancelaciones" : undefined}
          />
        </InlineGrid>

        {/* Secondary KPIs */}
        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          <KpiCard
            title="ARPU"
            value={arpu}
            format="currency"
            accent="green"
            icon="arpu"
            subtitle="ingreso promedio por usuario"
          />
          <KpiCard
            title="Recolecciones prox. 30 dias"
            value={upcomingCollections}
            format="currency"
            accent="blue"
            icon="calendar"
            subtitle="estimado"
          />
          <KpiCard
            title="Edad promedio"
            value={avgAgeDays === 0 ? "N/A" : `${avgAgeDays} dias`}
            accent="purple"
            icon="clock"
            subtitle="de suscripciones activas"
          />
          <KpiCard
            title="Ingresos promedio de vida"
            value={avgLifetimeRevenue}
            format="currency"
            accent="amber"
            icon="lifetime"
            subtitle="por suscriptor"
          />
        </InlineGrid>

        {/* Revenue Chart */}
        <RevenueChart data={revenueByMonth} totalRevenue={totalRevenue} />

        {/* Charts secundarios */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <PlanDistribution data={subsByPlan} />
          <StatusDonut data={subsByStatus} />
        </InlineGrid>

        {/* Ciudades + Actividad */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          {/* Top ciudades */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <div className="chart-title">Top ciudades</div>
                <div className="chart-subtitle">Por cantidad de suscriptores</div>
              </div>
            </div>
            {topCities.length === 0 ? (
              <div className="chart-empty">
                <div className="chart-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="chart-empty-text">Sin datos de ubicacion</div>
              </div>
            ) : (
              <BlockStack gap="400">
                {topCities.map((c, i) => (
                  <div key={c.city} className="city-row">
                    <div className="city-rank">{i + 1}</div>
                    <div className="city-info">
                      <div className="city-name">{c.city}</div>
                      <div className="city-bar-track">
                        <div className="city-bar-fill" style={{ width: `${(c.count / maxCityCount) * 100}%` }} />
                      </div>
                    </div>
                    <div className="city-count">{c.count}</div>
                  </div>
                ))}
              </BlockStack>
            )}
          </div>

          {/* Actividad reciente */}
          <ActivityFeed events={activityFeed} />
        </InlineGrid>

        {/* Tabla de suscripciones */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Suscripciones recientes</Text>
            {recentSubs.length === 0 ? (
              <div className="chart-empty">
                <div className="chart-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="chart-empty-text">No hay suscripciones todavia</div>
              </div>
            ) : (
              <IndexTable
                itemCount={recentSubs.length}
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
                {recentSubs.map((sub, index) => (
                  <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                    <IndexTable.Cell>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="bold" as="span">
                          {sub.payerName || sub.payerEmail}
                        </Text>
                        {sub.payerName && (
                          <Text variant="bodySm" tone="subdued" as="span">
                            {sub.payerEmail}
                          </Text>
                        )}
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{sub.planName}</IndexTable.Cell>
                    <IndexTable.Cell>
                      ${sub.amount.toLocaleString()} {sub.currency}
                    </IndexTable.Cell>
                    <IndexTable.Cell>{sub.shippingCity || "—"}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <StatusBadge status={sub.status} />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {new Date(sub.createdAt).toLocaleDateString("es-AR")}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
