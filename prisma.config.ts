import dotenv from "dotenv";
import { existsSync } from "fs";
for (const f of [".env.development.local", ".env.development", ".env.local", ".env"]) {
  if (existsSync(f)) { dotenv.config({ path: f }); break; }
}
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
