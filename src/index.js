import express from "express";
import cors from "cors";
import uploadRouter from "./routes/upload.js";
import transactionsRouter from "./routes/transactions.js";
import matchRouter from "./routes/match.js";
import reconcileRouter from "./routes/reconcile.js";
import dashboardRouter from "./routes/dashboard.js";
import customersRouter from "./routes/customers.js";
import receiptsRouter from "./routes/receipts.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/upload", uploadRouter);
app.use("/transactions", transactionsRouter);
app.use("/match", matchRouter);
app.use("/reconcile", reconcileRouter);
app.use("/dashboard", dashboardRouter);
app.use("/customers", customersRouter);
app.use("/receipts", receiptsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal error" });
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
