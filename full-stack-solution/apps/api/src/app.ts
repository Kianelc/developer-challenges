import express, { type Express } from "express";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middlewares/error-handler";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
