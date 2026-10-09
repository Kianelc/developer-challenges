import { AppRouters } from "./app";
import { Env } from "./config/env";
import { PrismaClient } from "./generated/prisma/client";
import { createAuthModule } from "./modules/auth/auth.module";
import { PrismaAuthRepository } from "./modules/auth/auth.repository";
import { TokenService } from "./modules/auth/token.service";

export function createRouters(env: Env, prisma: PrismaClient): AppRouters {
  const tokenService = new TokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const auth = createAuthModule(new PrismaAuthRepository(prisma), tokenService);

  return { auth: auth.router };
}
