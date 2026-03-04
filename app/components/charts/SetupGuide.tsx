import { Link } from "@remix-run/react";

interface SetupStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  href?: string;
  ctaLabel?: string;
  onAction?: () => void;
}

interface SetupGuideProps {
  hasMercadoPago: boolean;
  hasPlans: boolean;
  hasThemeSetup: boolean;
  hasFirstSale: boolean;
  onMarkThemeDone: () => void;
}

export function SetupGuide({
  hasMercadoPago,
  hasPlans,
  hasThemeSetup,
  hasFirstSale,
  onMarkThemeDone,
}: SetupGuideProps) {
  const steps: SetupStep[] = [
    {
      key: "mercadopago",
      title: "Conectar MercadoPago",
      description: "Ingresa tus credenciales de Access Token y Public Key para procesar pagos.",
      done: hasMercadoPago,
      href: "/app/settings",
      ctaLabel: "Configurar",
    },
    {
      key: "plans",
      title: "Crear un plan de suscripcion",
      description: "Define precio, frecuencia y descuento. Tus clientes van a elegir entre estos planes.",
      done: hasPlans,
      href: "/app/plans",
      ctaLabel: "Crear plan",
    },
    {
      key: "theme",
      title: "Activar en tu tienda",
      description: "Agrega el bloque de suscripcion en la pagina de producto desde el editor de temas.",
      done: hasThemeSetup,
      ctaLabel: "Marcar como listo",
      onAction: onMarkThemeDone,
    },
    {
      key: "first-sale",
      title: "Primera suscripcion",
      description: "Cuando un cliente se suscriba, este paso se completa automaticamente.",
      done: hasFirstSale,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <div className="setup-guide">
      <div className="setup-guide-header">
        <div>
          <div className="setup-guide-title">Configura tu app</div>
          <div className="setup-guide-subtitle">
            {completedCount} de {steps.length} pasos completados
          </div>
        </div>
      </div>

      <div className="setup-guide-progress-track">
        <div
          className="setup-guide-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="setup-guide-steps">
        {steps.map((step, i) => (
          <div
            key={step.key}
            className={`setup-guide-step ${step.done ? "setup-guide-step--done" : ""}`}
          >
            <div className="setup-guide-step-icon">
              {step.done ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <div className="setup-guide-step-content">
              <div className="setup-guide-step-title">{step.title}</div>
              {!step.done && (
                <div className="setup-guide-step-desc">{step.description}</div>
              )}
            </div>
            {!step.done && step.ctaLabel && (
              <div className="setup-guide-step-action">
                {step.href ? (
                  <Link to={step.href} className="setup-guide-btn">
                    {step.ctaLabel}
                  </Link>
                ) : step.onAction ? (
                  <button
                    type="button"
                    className="setup-guide-btn setup-guide-btn--secondary"
                    onClick={step.onAction}
                  >
                    {step.ctaLabel}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
