import { z } from "zod";

export const MACHINE_TYPE = ["Pump", "Fan"] as const;

export const machineTypeSchema = z.enum(MACHINE_TYPE);
export type MachineType = z.infer<typeof machineTypeSchema>;

const machineNameSchema = z
  .string()
  .trim()
  .min(2, "Name is required")
  .max(100, "Name must have at most 100 caracteres");

export const createMachineSchema = z.object({
  name: machineNameSchema,
  type: machineTypeSchema,
});

export type CreateMachineInput = z.infer<typeof createMachineSchema>;

export const updateMachineSchema = createMachineSchema
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Provide at least one field to update",
  });

export type UpdateMachineType = z.infer<typeof updateMachineSchema>;
