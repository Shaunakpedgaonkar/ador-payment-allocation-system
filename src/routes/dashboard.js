import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/stats", async (_req, res, next) => {
  try {
    const now = new Date();
    const d30 = new Date(now); d30.setDate(now.getDate() - 30);
    const d60 = new Date(now); d60.setDate(now.getDate() - 60);

    const [
      total, unmatched, matched, reconciled, customerCount,
      txnAmountAgg, reconciledAgg, openInvoices, allInvoices,
      recentLogs,
    ] = await Promise.all([
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: "UNMATCHED" } }),
      prisma.transaction.count({ where: { status: "MATCHED" } }),
      prisma.transaction.count({ where: { status: "RECONCILED" } }),
      prisma.customer.count(),
      prisma.transaction.aggregate({ _sum: { amount: true } }),
      prisma.transaction.aggregate({
        where: { status: "RECONCILED" },
        _sum: { amount: true },
      }),
      prisma.invoice.findMany({ where: { status: { not: "PAID" } } }),
      prisma.invoice.findMany(),
      prisma.activityLog.findMany({
        where: { action: "RECONCILED" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          transaction: { include: { customer: true } },
        },
      }),
    ]);

    const outstanding = openInvoices.reduce((s, inv) => s + inv.balanceRemaining, 0);
    const totalReceivables = allInvoices.reduce((s, inv) => s + inv.amount, 0);
    const collected = reconciledAgg._sum.amount || 0;
    const matchRate = total === 0 ? 0 : Math.round(((matched + reconciled) / total) * 100);

    // Aging: based on how overdue open invoices are
    const aging = { current: 0, overdue30: 0, overdue60plus: 0 };
    for (const inv of openInvoices) {
      const due = new Date(inv.dueDate);
      if (due >= d30) aging.current += inv.balanceRemaining;
      else if (due >= d60) aging.overdue30 += inv.balanceRemaining;
      else aging.overdue60plus += inv.balanceRemaining;
    }

    const recentActivity = recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      description: log.description,
      customer: log.transaction.customer?.name || "—",
      amount: log.transaction.amount,
      txnId: log.transactionId,
      at: log.createdAt,
    }));

    res.json({
      totalTransactions: total,
      unmatched,
      matched,
      reconciled,
      customers: customerCount,
      matchRate,
      totalTransactionAmount: txnAmountAgg._sum.amount || 0,
      totalCollected: collected,
      outstandingReceivables: outstanding,
      totalReceivables,
      openInvoices: openInvoices.length,
      aging,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
