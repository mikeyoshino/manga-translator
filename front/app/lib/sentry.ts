import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
});

export default Sentry;
