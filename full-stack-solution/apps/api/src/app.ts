import express, { type Express, type Router } from "express";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middlewares/error-handler";

export interface AppRouters {
  auth: Router;
  machines: Router;
  monitoringPoints: Router;
}

export function createApp(routers: Partial<AppRouters>): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  if (routers.auth) app.use("/api/auth", routers.auth);
  if (routers.machines) app.use("/api/machines", routers.machines);
  if (routers.monitoringPoints) app.use("/api", routers.monitoringPoints);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
