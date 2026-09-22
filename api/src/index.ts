import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { offersRouter } from "./routes/offers.js";
import { applicationsRouter } from "./routes/applications.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "jobradar-api" });
});

app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/offers", offersRouter);
app.use("/applications", applicationsRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`JobRadar API listening on http://localhost:${port}`);
});
