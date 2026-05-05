import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { status: String(status).toUpperCase() } : {};
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        customer: true,
        payments: { include: { invoice: true } },
        activityLogs: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { txnDate: "desc" },
    });
    res.json(transactions);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const txn = await prisma.transaction.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        customer: true,
        payments: { include: { invoice: true } },
        activityLogs: { orderBy: { createdAt: "asc" } },
        receipt: true,
      },
    });
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    res.json(txn);
  } catch (err) {
    next(err);
  }
});

router.delete("/", async (_req, res, next) => {
  try {
    await prisma.receipt.deleteMany({});
    await prisma.activityLog.deleteMany({});
    await prisma.invoicePayment.deleteMany({});
    await prisma.transaction.deleteMany({});
    const invoices = await prisma.invoice.findMany();
    await Promise.all(
      invoices.map((inv) =>
        prisma.invoice.update({
          where: { id: inv.id },
          data: { balanceRemaining: inv.amount, status: "OPEN" },
        })
      )
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
