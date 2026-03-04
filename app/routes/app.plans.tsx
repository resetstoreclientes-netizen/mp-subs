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
  EmptyState,
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
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { createdAt: "desc" },
  });

  return json({ plans });
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
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Nuevo plan de suscripcion
                  </Text>
                  <FormLayout>
                    <TextField
                      label="Nombre del plan"
                      value={name}
                      onChange={setName}
                      autoComplete="off"
                      placeholder="Ej: 1 Gotero / mes"
                    />
                    <TextField
                      label="Descripcion"
                      value={description}
                      onChange={setDescription}
                      autoComplete="off"
                      placeholder="Ej: Suministro para 1 mes"
                    />
                    <FormLayout.Group>
                      <TextField
                        label="Cantidad de unidades"
                        value={quantity}
                        onChange={setQuantity}
                        type="number"
                        autoComplete="off"
                        helpText="Cuantas unidades incluye este plan"
                      />
                      <Select
                        label="Moneda"
                        options={currencyOptions}
                        value={currency}
                        onChange={setCurrency}
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
                        helpText="Precio de compra unica"
                      />
                      <TextField
                        label="Precio suscripcion"
                        value={amount}
                        onChange={setAmount}
                        type="number"
                        autoComplete="off"
                        prefix="$"
                        helpText={
                          discount > 0
                            ? `${discount}% de descuento`
                            : "Precio con descuento por suscripcion"
                        }
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField
                        label="Cada"
                        value={frequency}
                        onChange={setFrequency}
                        type="number"
                        autoComplete="off"
                      />
                      <Select
                        label="Periodo"
                        options={frequencyOptions}
                        value={frequencyType}
                        onChange={setFrequencyType}
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
            )}

            <Card>
              {plans.length === 0 ? (
                <EmptyState
                  heading="No hay planes de suscripcion"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Crea tu primer plan para empezar a recibir suscripciones.
                  </p>
                </EmptyState>
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
                          <Text variant="bodyMd" fontWeight="bold" as="span">
                            {plan.name}
                          </Text>
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
                          {plan._count.subscriptions}
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
