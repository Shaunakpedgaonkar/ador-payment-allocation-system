import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// ─── List all customers (used by dropdowns) ───────────────────────────────────
router.get("/", async (_req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        invoices: { where: { status: { not: "PAID" } } },
      },
      orderBy: { name: "asc" },
    });
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

// ─── Customer ledger — aggregated financial overview per customer ──────────────
// IMPORTANT: this must come before /:id routes to avoid "ledger" being read as an id
router.get("/ledger", async (_req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        transactions: { some: {} },
      },
      include: {
        transactions: {
          include: {
            payments: { include: { invoice: true } },
          },
          orderBy: { txnDate: "desc" },
        },
        invoices: {
          orderBy: { dueDate: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const ledger = customers.map((c) => {
      const txns = c.transactions;
      const invoices = c.invoices;

      // Transaction aggregates
      const totalReceived = txns
        .filter((t) => t.status === "RECONCILED")
        .reduce((s, t) => s + t.amount, 0);

      const matchedPending = txns
        .filter((t) => t.status === "MATCHED")
        .reduce((s, t) => s + t.amount, 0);

      // Invoice aggregates
      const openInvoices = invoices.filter((i) => i.status !== "PAID");
      const paidInvoices = invoices.filter((i) => i.status === "PAID");
      const totalOutstanding = openInvoices.reduce(
        (s, i) => s + i.balanceRemaining,
        0
      );
      const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);

      // Customer-level status
      let status = "OPEN";
      if (invoices.length > 0 && openInvoices.length === 0) status = "CLEARED";
      else if (totalReceived > 0 || paidInvoices.length > 0) status = "PARTIAL";

      return {
        id: c.id,
        name: c.name,
        aliases: c.aliases,
        totalReceived,
        matchedPending,
        totalOutstanding,
        totalInvoiced,
        openInvoiceCount: openInvoices.length,
        paidInvoiceCount: paidInvoices.length,
        status,
        transactions: txns,
        invoices,
      };
    });

    res.json(ledger);
  } catch (err) {
    next(err);
  }
});

// ─── Open invoices for a specific customer ────────────────────────────────────
router.get("/:id/invoices", async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        customerId: Number(req.params.id),
        status: { not: "PAID" },
      },
      orderBy: { dueDate: "asc" },
    });
    res.json(invoices);
  } catch (err) {
    next(err);
  }
});

export default router;
