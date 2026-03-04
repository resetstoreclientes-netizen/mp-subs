import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { Link } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, plansCount] = await Promise.all([
    db.settings.findUnique({ where: { shop: session.shop } }),
    db.plan.count({ where: { shop: session.shop } }),
  ]);

  return json({
    mpAccessToken: settings?.mpAccessToken || "",
    mpPublicKey: settings?.mpPublicKey || "",
    webhookSecret: settings?.webhookSecret || "",
    plansCount,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const mpAccessToken = formData.get("mpAccessToken") as string;
  const mpPublicKey = formData.get("mpPublicKey") as string;
  const webhookSecret = formData.get("webhookSecret") as string;

  if (!mpAccessToken || !mpPublicKey) {
    return json(
      { error: "Access Token y Public Key son obligatorios" },
      { status: 400 },
    );
  }

  await db.settings.upsert({
    where: { shop: session.shop },
    update: { mpAccessToken, mpPublicKey, webhookSecret },
    create: {
      shop: session.shop,
      mpAccessToken,
      mpPublicKey,
      webhookSecret,
    },
  });

  return json({ success: true });
};

export default function SettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [mpAccessToken, setMpAccessToken] = useState(loaderData.mpAccessToken);
  const [mpPublicKey, setMpPublicKey] = useState(loaderData.mpPublicKey);
  const [webhookSecret, setWebhookSecret] = useState(loaderData.webhookSecret);

  const isLoading = navigation.state === "submitting";

  const handleSave = () => {
    const formData = new FormData();
    formData.append("mpAccessToken", mpAccessToken);
    formData.append("mpPublicKey", mpPublicKey);
    formData.append("webhookSecret", webhookSecret);
    submit(formData, { method: "POST" });
  };

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {actionData && "success" in actionData && (
              <Banner tone="success">
                <BlockStack gap="300">
                  <p>Credenciales guardadas correctamente.</p>
                  {loaderData.plansCount === 0 ? (
                    <p>
                      <Link to="/app/plans" style={{ fontWeight: 600 }}>
                        Siguiente paso: Crear tu primer plan →
                      </Link>
                    </p>
                  ) : (
                    <p>
                      <Link to="/app" style={{ fontWeight: 600 }}>
                        Volver al Dashboard →
                      </Link>
                    </p>
                  )}
                </BlockStack>
              </Banner>
            )}
            {actionData && "error" in actionData && (
              <Banner tone="critical">
                <p>{actionData.error}</p>
              </Banner>
            )}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Credenciales de MercadoPago
                </Text>
                <Banner tone="info">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Como obtener tus credenciales:</Text>
                    <Text as="p" variant="bodyMd">
                      1. Ingresa a{" "}
                      <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer">
                        mercadopago.com.ar/developers
                      </a>
                    </Text>
                    <Text as="p" variant="bodyMd">2. Selecciona tu aplicacion (o crea una nueva)</Text>
                    <Text as="p" variant="bodyMd">3. Ve a "Credenciales de produccion" (o "de prueba" para testear)</Text>
                    <Text as="p" variant="bodyMd">4. Copia el Access Token y la Public Key</Text>
                  </BlockStack>
                </Banner>
                <FormLayout>
                  <TextField
                    label="Access Token"
                    value={mpAccessToken}
                    onChange={setMpAccessToken}
                    type="password"
                    autoComplete="off"
                    helpText="Ej: APP_USR-xxxx o TEST-xxxx"
                  />
                  <TextField
                    label="Public Key"
                    value={mpPublicKey}
                    onChange={setMpPublicKey}
                    autoComplete="off"
                    helpText="Ej: APP_USR-xxxx o TEST-xxxx"
                  />
                  <TextField
                    label="Webhook Secret (opcional)"
                    value={webhookSecret}
                    onChange={setWebhookSecret}
                    type="password"
                    autoComplete="off"
                    helpText="Para validar la autenticidad de los webhooks de MP"
                  />
                </FormLayout>
                <Button
                  variant="primary"
                  loading={isLoading}
                  onClick={handleSave}
                >
                  Guardar credenciales
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  URL del Webhook
                </Text>
                <Text as="p" variant="bodyMd">
                  Configura esta URL en tu panel de MercadoPago como
                  Notification URL para recibir actualizaciones de pagos:
                </Text>
                <Banner>
                  <p>
                    <code>
                      {`${typeof window !== "undefined" ? window.location.origin : "[TU_APP_URL]"}/webhooks/mercadopago`}
                    </code>
                  </p>
                </Banner>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
