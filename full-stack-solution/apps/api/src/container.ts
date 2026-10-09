import type { AppRouters } from "./app";
import type { Env } from "./config/env";
import type { PrismaClient } from "./generated/prisma/client";
import { createAuthModule } from "./modules/auth/auth.module";
import { PrismaAuthRepository } from "./modules/auth/auth.repository";
import { TokenService } from "./modules/auth/token.service";
import { createMachinesModule } from "./modules/machines/machines.module";
import { PrismaMachinesRepository } from "./modules/machines/machines.repository";

/** Composition root: the only place that knows how every piece is wired. */
export function createRouters(env: Env, prisma: PrismaClient): AppRouters {
  const tokenService = new TokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const auth = createAuthModule(new PrismaAuthRepository(prisma), tokenService);
  const machines = createMachinesModule(
    new PrismaMachinesRepository(prisma),
    auth.authenticate,
  );

  return { auth: auth.router, machines: machines.router };
}
