import express, { type Express, type Router } from "express";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middlewares/error-handler";

export interface AppRouters {
  auth: Router;
  machines: Router;
  monitoringPoints: Router;
  timeSeries: Router;
}

const READINGS_BODY_LIMIT = "256kb";

export function createApp(routers: Partial<AppRouters>): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  if (routers.auth) app.use("/api/auth", routers.auth);
  if (routers.machines) app.use("/api/machines", routers.machines);
  if (routers.monitoringPoints) app.use("/api", routers.monitoringPoints);
  if (routers.timeSeries) {
    // Only the ingest path gets an expanded body limit.
    app.use(
      "/api/monitoring-points/:id/readings",
      express.json({ limit: READINGS_BODY_LIMIT }),
      routers.timeSeries,
    );
    app.use("/api", routers.timeSeries);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
