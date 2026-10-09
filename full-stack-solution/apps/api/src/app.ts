import express, { type Express, type Router } from "express";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middlewares/error-handler";

export interface AppRouters {
  auth: Router;
}

export function createApp(routers: AppRouters): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", routers.auth);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
