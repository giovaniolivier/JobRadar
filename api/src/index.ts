import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { settingsRouter } from "./routes/settings.js";
import { offersRouter } from "./routes/offers.js";
import { applicationsRouter } from "./routes/applications.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { notificationsRouter } from "./routes/notifications.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { csrfProtect } from "./middleware/csrf.js";
import { enforceHttps } from "./middleware/https.js";
import { assertJwtSecret } from "./lib/authTokens.js";

assertJwtSecret();

const app = express();
const port = Number(process.env.PORT ?? 4000);
const origin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(enforceHttps);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  })
);
app.use(
  cors({
    origin,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(csrfProtect);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "jobradar-api" });
});

app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/settings", settingsRouter);
app.use("/dashboard", dashboardRouter);
app.use("/notifications", notificationsRouter);
app.use("/offers", offersRouter);
app.use("/applications", applicationsRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`JobRadar API listening on http://localhost:${port}`);
});
