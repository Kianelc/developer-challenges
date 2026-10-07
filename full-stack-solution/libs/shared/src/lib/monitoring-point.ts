import { z } from "zod";

export const MIN_MONITORING_POINTS_PER_MACHINE = 2;

export const createMonitoringPointSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .max(100, "Name must have at most 100 caracters"),
});

export type CrateMonitoringPointInput = z.infer<
  typeof createMonitoringPointSchema
>;
