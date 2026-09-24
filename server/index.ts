import { Hono } from "hono";
import type { Env } from "./lib/env.js";
import { authRoutes } from "./routes/auth.js";
import { ministryRoutes } from "./routes/ministries.js";
import { userRoutes } from "./routes/users.js";
import { eventRoutes } from "./routes/events.js";
import { scheduleRoutes } from "./routes/schedules.js";
import { unavailabilityRoutes } from "./routes/unavailability.js";
import { swapRoutes } from "./routes/swaps.js";
import { reportRoutes } from "./routes/reports.js";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Erro interno" }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api")) {
    return c.json({ error: "Rota não encontrada" }, 404);
  }
  return c.text("Not Found", 404);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoutes);
app.route("/api/ministries", ministryRoutes);
app.route("/api/users", userRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/schedules", scheduleRoutes);
app.route("/api/unavailability", unavailabilityRoutes);
app.route("/api/swaps", swapRoutes);
app.route("/api/reports", reportRoutes);

export default app;
