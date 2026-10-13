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

/**
 * Body limit for the readings ingest path.
 *
 * `MAX_READINGS_PER_BATCH` (4 000) readings serialize to roughly 400 KB
 * compact (~100 bytes each: millisecond timestamp, a long negative value and
 * the metric name). 1 MB leaves room for a client that sends the batch
 * formatted. The schema, not this limit, is what caps the number of readings.
 */
const READINGS_BODY_LIMIT = "1mb";
const READINGS_PATH = "/api/monitoring-points/:id/readings";

export function createApp(routers: Partial<AppRouters>): Express {
  const app = express();
  app.disable("x-powered-by");

  // The ingest path accepts a larger body than every other route, and its
  // parser has to be registered BEFORE the default one: body-parser skips a
  // request whose body another parser already consumed, so a larger limit
  // mounted further down never takes effect.
  app.use(READINGS_PATH, express.json({ limit: READINGS_BODY_LIMIT }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  if (routers.auth) app.use("/api/auth", routers.auth);
  if (routers.machines) app.use("/api/machines", routers.machines);
  if (routers.monitoringPoints) app.use("/api", routers.monitoringPoints);
  if (routers.timeSeries) app.use("/api", routers.timeSeries);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
