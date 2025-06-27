import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: "/data/db.sqlite",
  },
});