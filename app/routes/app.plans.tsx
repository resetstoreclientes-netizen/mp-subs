import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Banner,
  BlockStack,
  Text,
  Select,
  IndexTable,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const plans = await db.plan.findMany({
    where: { shop: session.shop },
    include: {
      _count: { select: { subscriptions: true } },
      subscriptions: {
        where: { status: "authorized" },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Revenue por plan (sum de payment events)
  const planRevenue = await db.subscriptionEvent.groupBy({
    by: ["subscriptionId"],
    where: { shop: session.shop, type: "payment" },
    _sum: { amount: true },
  });

  // Map subscription IDs to plan IDs
  const subToPlan: Record<string, string> = {};
  for (const plan of plans) {
    for (const sub of plan.subscriptions) {
      subToPlan[sub.id] = plan.id;
    }
  }

  const revenueByPlan: Record<string, number> = {};
  for (const entry of planRevenue) {
    const planId = subToPlan[entry.subscriptionId];
    if (planId) {
      revenueByPlan[planId] = (revenueByPlan[planId] || 0) + (entry._sum.amount || 0);
    }
  }

  // Find most popular plan (most active subs)
  let popularPlanId = "";
  let maxActiveSubs = 0;
  for (const plan of plans) {
    const activeCount = plan.subscriptions.length;
    if (activeCount > maxActiveSubs) {
      maxActiveSubs = activeCount;
      popularPlanId = plan.id;
    }
  }

  const plansData = plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    amount: p.amount,
    originalPrice: p.originalPrice,
    quantity: p.quantity,
    currency: p.currency,
    frequencyType: p.frequencyType,
    frequency: p.frequency,
    active: p.active,
    subscriberCount: p._count.subscriptions,
    activeSubCount: p.subscriptions.length,
    revenue: revenueByPlan[p.id] || 0,
    isPopular: p.id === popularPlanId && maxActiveSubs > 0,
  }));

  return json({ plans: plansData });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const originalPrice = parseFloat(formData.get("originalPrice") as string);
    const quantity = parseInt(formData.get("quantity") as string || "1", 10);
    const currency = formData.get("currency") as string;
    const frequencyType = formData.get("frequencyType") as string;
    const frequency = parseInt(formData.get("frequency") as string, 10);

    if (!name || !amount || !frequency || !originalPrice) {
      return json(
        { error: "Nombre, monto, precio original y frecuencia son obligatorios" },
        { status: 400 },
      );
    }

    await db.plan.create({
      data: {
        shop: session.shop,
        name,
        description: description || "",
        amount,
        originalPrice,
        quantity,
        currency: currency || "ARS",
        frequencyType: frequencyType || "months",
        frequency,
      },
    });

    return json({ success: true, message: "Plan creado exitosamente" });
  }

  if (intent === "delete") {
    const planId = formData.get("planId") as string;
    await db.plan.delete({ where: { id: planId } });
    return json({ success: true, message: "Plan eliminado" });
  }

  if (intent === "toggle") {
    const planId = formData.get("planId") as string;
    const plan = await db.plan.findUnique({ where: { id: planId } });
    if (plan) {
      await db.plan.update({
        where: { id: planId },
        data: { active: !plan.active },
      });
    }
    return json({ success: true });
  }

  return json({ error: "Intent no reconocido" }, { status: 400 });
};

export default function PlansPage() {
  const { plans } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [currency, setCurrency] = useState("ARS");
  const [frequencyType, setFrequencyType] = useState("months");
  const [frequency, setFrequency] = useState("1");

  const isLoading = navigation.state === "submitting";

  const discount =
    originalPrice && amount
      ? Math.round((1 - parseFloat(amount) / parseFloat(originalPrice)) * 100)
      : 0;

  const handleCreate = () => {
    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", name);
    formData.append("description", description);
    formData.append("amount", amount);
    formData.append("originalPrice", originalPrice);
    formData.append("quantity", quantity);
    formData.append("currency", currency);
    formData.append("frequencyType", frequencyType);
    formData.append("frequency", frequency);
    submit(formData, { method: "POST" });
    setShowForm(false);
    setName("");
    setDescription("");
    setAmount("");
    setOriginalPrice("");
    setQuantity("1");
    setFrequency("1");
  };

  const handleDelete = (planId: string) => {
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("planId", planId);
    submit(formData, { method: "POST" });
  };

  const handleToggle = (planId: string) => {
    const formData = new FormData();
    formData.append("intent", "toggle");
    formData.append("planId", planId);
    submit(formData, { method: "POST" });
  };

  const frequencyOptions = [
    { label: "Dias", value: "days" },
    { label: "Semanas", value: "weeks" },
    { label: "Meses", value: "months" },
  ];

  const currencyOptions = [
    { label: "ARS (Peso Argentino)", value: "ARS" },
    { label: "BRL (Real)", value: "BRL" },
    { label: "MXN (Peso Mexicano)", value: "MXN" },
    { label: "CLP (Peso Chileno)", value: "CLP" },
    { label: "COP (Peso Colombiano)", value: "COP" },
    { label: "USD (Dolar)", value: "USD" },
  ];

  const freqLabelMap: Record<string, string> = {
    months: "mes",
    days: "dia",
    weeks: "semana",
  };

  return (
    <Page>
      <TitleBar title="Planes de Suscripcion">
        <button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "Crear plan"}
        </button>
      </TitleBar>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {actionData && "error" in actionData && (
              <Banner tone="critical">
                <p>{actionData.error as string}</p>
              </Banner>
            )}
            {actionData && "message" in actionData && (
              <Banner tone="success">
                <p>{actionData.message as string}</p>
              </Banner>
            )}

            {showForm && (
              <Layout>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Nuevo plan de suscripcion
                      </Text>
                      <Banner tone="info">
                        <p>Este plan aparece como tarjeta en la pagina de producto de tu tienda.</p>
                      </Banner>
                      <FormLayout>
                        <TextField
                          label="Nombre del plan"
                          value={name}
                          onChange={setName}
                          autoComplete="off"
                          placeholder="Ej: 1 Gotero / mes"
                          helpText="Nombre visible para el cliente en la tienda"
                        />
                        <TextField
                          label="Descripcion"
                          value={description}
                          onChange={setDescription}
                          autoComplete="off"
                          placeholder="Ej: Suministro para 1 mes"
                          helpText="Texto corto que aparece debajo del nombre del plan"
                        />
                        <FormLayout.Group>
                          <TextField
                            label="Cantidad de unidades"
                            value={quantity}
                            onChange={setQuantity}
                            type="number"
                            autoComplete="off"
                            helpText="Cuantas unidades del producto incluye este plan"
                          />
                          <Select
                            label="Moneda"
                            options={currencyOptions}
                            value={currency}
                            onChange={setCurrency}
                            helpText="Moneda en la que se cobra"
                          />
                        </FormLayout.Group>
                        <FormLayout.Group>
                          <TextField
                            label="Precio original (sin descuento)"
                            value={originalPrice}
                            onChange={setOriginalPrice}
                            type="number"
                            autoComplete="off"
                            prefix="$"
                            helpText="Precio que el cliente pagaria sin suscribirse"
                          />
                          <TextField
                            label="Precio suscripcion"
                            value={amount}
                            onChange={setAmount}
                            type="number"
                            autoComplete="off"
                            prefix="$"
                            helpText="Precio final que se cobra cada ciclo"
                          />
                        </FormLayout.Group>
                        {discount > 0 && (
                          <div className="plan-form-discount-banner">
                            <span className="plan-form-discount-badge">{discount}% OFF</span>
                            <span>Tu cliente ahorra ${(parseFloat(originalPrice) - parseFloat(amount)).toLocaleString("es-AR")} por ciclo</span>
                          </div>
                        )}
                        <FormLayout.Group>
                          <TextField
                            label="Cada"
                            value={frequency}
                            onChange={setFrequency}
                            type="number"
                            autoComplete="off"
                            helpText="Intervalo entre cobros"
                          />
                          <Select
                            label="Periodo"
                            options={frequencyOptions}
                            value={frequencyType}
                            onChange={setFrequencyType}
                            helpText="Unidad de tiempo del ciclo"
                          />
                        </FormLayout.Group>
                      </FormLayout>
                      <Button
                        variant="primary"
                        loading={isLoading}
                        onClick={handleCreate}
                      >
                        Crear plan
                      </Button>
                    </BlockStack>
                  </Card>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingSm">Vista previa</Text>
                      <div className="plan-preview-card">
                        {discount > 0 && (
                          <div className="plan-preview-badge">{discount}% OFF</div>
                        )}
                        <div className="plan-preview-name">{name || "Nombre del plan"}</div>
                        <div className="plan-preview-price-row">
                          {originalPrice && parseFloat(originalPrice) > 0 && discount > 0 && (
                            <span className="plan-preview-original">${parseFloat(originalPrice).toLocaleString("es-AR")}</span>
                          )}
                          <span className="plan-preview-price">
                            ${amount ? parseFloat(amount).toLocaleString("es-AR") : "0"}
                          </span>
                          <span className="plan-preview-freq">
                            /{freqLabelMap[frequencyType] || frequencyType}
                          </span>
                        </div>
                        {description && (
                          <div className="plan-preview-desc">{description}</div>
                        )}
                        <div className="plan-preview-qty">
                          x{quantity} {parseInt(quantity) === 1 ? "unidad" : "unidades"}
                        </div>
                        <div className="plan-preview-btn">Suscribirme</div>
                      </div>
                    </BlockStack>
                  </Card>
                </Layout.Section>
              </Layout>
            )}

            <Card>
              {plans.length === 0 ? (
                <div className="plans-empty-state">
                  <div className="plans-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                  </div>
                  <div className="plans-empty-title">Crea tu primer plan de suscripcion</div>
                  <div className="plans-empty-desc">
                    Los planes definen cuanto cobras, con que frecuencia, y que descuento ofreces.
                    Tus clientes van a ver cada plan como una tarjeta en la pagina de producto.
                  </div>
                  <div className="plans-empty-example">
                    <div className="plans-empty-example-label">Ejemplo de como se ve:</div>
                    <div className="plan-preview-card plan-preview-card--mini">
                      <div className="plan-preview-badge">15% OFF</div>
                      <div className="plan-preview-name">1 Gotero / mes</div>
                      <div className="plan-preview-price-row">
                        <span className="plan-preview-original">$12.000</span>
                        <span className="plan-preview-price">$10.200</span>
                        <span className="plan-preview-freq">/mes</span>
                      </div>
                      <div className="plan-preview-btn">Suscribirme</div>
                    </div>
                  </div>
                  <Button variant="primary" onClick={() => setShowForm(true)}>
                    Crear mi primer plan
                  </Button>
                </div>
              ) : (
                <IndexTable
                  itemCount={plans.length}
                  headings={[
                    { title: "Nombre" },
                    { title: "Cantidad" },
                    { title: "Precio" },
                    { title: "Descuento" },
                    { title: "Frecuencia" },
                    { title: "Suscriptores" },
                    { title: "Revenue" },
                    { title: "Estado" },
                    { title: "Acciones" },
                  ]}
                  selectable={false}
                >
                  {plans.map((plan, index) => {
                    const disc =
                      plan.originalPrice > 0
                        ? Math.round(
                            (1 - plan.amount / plan.originalPrice) * 100,
                          )
                        : 0;
                    const freqLabel: Record<string, string> = {
                      months: "mes(es)",
                      days: "dia(s)",
                      weeks: "semana(s)",
                    };
                    return (
                      <IndexTable.Row
                        id={plan.id}
                        key={plan.id}
                        position={index}
                      >
                        <IndexTable.Cell>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="bold" as="span">
                              {plan.name}
                            </Text>
                            {plan.isPopular && (
                              <Badge tone="info">Popular</Badge>
                            )}
                          </InlineStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          x{plan.quantity}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          ${plan.amount} {plan.currency}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {disc > 0 ? (
                            <Badge tone="success">{`${disc}% OFF`}</Badge>
                          ) : (
                            "-"
                          )}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          Cada {plan.frequency}{" "}
                          {freqLabel[plan.frequencyType] || plan.frequencyType}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            <Text variant="bodyMd" as="span">{plan.subscriberCount}</Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              {plan.activeSubCount} activas
                            </Text>
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text variant="bodyMd" as="span">
                            ${plan.revenue.toLocaleString()} {plan.currency}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={plan.active ? "success" : undefined}>
                            {plan.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              onClick={() => handleToggle(plan.id)}
                            >
                              {plan.active ? "Desactivar" : "Activar"}
                            </Button>
                            <Button
                              size="slim"
                              tone="critical"
                              onClick={() => handleDelete(plan.id)}
                            >
                              Eliminar
                            </Button>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
