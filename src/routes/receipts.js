import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/:transactionId", async (req, res, next) => {
  try {
    const transactionId = Number(req.params.transactionId);

    const receipt = await prisma.receipt.findUnique({
      where: { transactionId },
    });
    if (!receipt) return res.status(404).json({ error: "Receipt not found" });

    const txn = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        customer: true,
        payments: {
          include: {
            invoice: true,
          },
        },
      },
    });

    const totalAllocated = txn.payments.reduce((s, p) => s + p.amountApplied, 0);
    const unallocated = Math.max(0, txn.amount - totalAllocated);

    res.json({
      receiptNumber: receipt.receiptNumber,
      generatedAt: receipt.generatedAt,
      customer: txn.customer,
      transaction: {
        id: txn.id,
        txnDate: txn.txnDate,
        amount: txn.amount,
        narration: txn.narration,
        reference: txn.reference,
        status: txn.status,
      },
      allocations: txn.payments.map((p) => ({
        invoiceNumber: p.invoice.invoiceNumber,
        invoiceDate: p.invoice.createdAt,
        originalAmount: p.invoice.amount,
        amountApplied: p.amountApplied,
        remainingBalance: p.invoice.balanceRemaining,
        invoiceStatus: p.invoice.status,
      })),
      summary: {
        totalReceived: txn.amount,
        totalAllocated,
        unallocated,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
