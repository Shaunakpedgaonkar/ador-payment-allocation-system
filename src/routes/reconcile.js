import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

router.post("/", async (req, res, next) => {
  try {
    const { transactionId, allocations } = req.body;
    if (!transactionId || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: "transactionId and allocations[] required" });
    }

    const txn = await prisma.transaction.findUnique({
      where: { id: Number(transactionId) },
      include: { payments: true },
    });
    if (!txn) return res.status(404).json({ error: "Transaction not found" });

    const alreadyApplied = txn.payments.reduce((s, p) => s + p.amountApplied, 0);
    const totalAllocating = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);

    if (alreadyApplied + totalAllocating > txn.amount + 0.01) {
      return res.status(400).json({
        error: `Allocation exceeds transaction amount. Available: ${(txn.amount - alreadyApplied).toFixed(2)}`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoiceDescriptions = [];

      for (const a of allocations) {
        const invoiceId = Number(a.invoiceId);
        const amount = Number(a.amount);
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
        if (amount <= 0) throw new Error("Allocation amount must be positive");
        if (amount > invoice.balanceRemaining + 0.01) {
          throw new Error(
            `Invoice ${invoice.invoiceNumber} has only ${invoice.balanceRemaining.toFixed(2)} outstanding`
          );
        }

        await tx.invoicePayment.create({
          data: { transactionId: txn.id, invoiceId, amountApplied: amount },
        });

        const newBalance = invoice.balanceRemaining - amount;
        const newStatus = newBalance <= 0.009 ? "PAID" : "PARTIAL";
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { balanceRemaining: Math.max(0, newBalance), status: newStatus },
        });

        invoiceDescriptions.push(`${invoice.invoiceNumber} (${inr(amount)})`);
      }

      const newlyApplied = alreadyApplied + totalAllocating;
      const newTxnStatus = newlyApplied >= txn.amount - 0.01 ? "RECONCILED" : "MATCHED";
      const remaining = txn.amount - newlyApplied;

      const customerId =
        txn.customerId ||
        (await tx.invoice
          .findUnique({ where: { id: Number(allocations[0].invoiceId) } })
          .then((inv) => inv?.customerId));

      const updatedTxn = await tx.transaction.update({
        where: { id: txn.id },
        data: {
          status: newTxnStatus,
          customerId: customerId || undefined,
          activityLogs: {
            create: {
              action: "RECONCILED",
              description: `${inr(totalAllocating)} allocated to: ${invoiceDescriptions.join(", ")}${remaining > 0.01 ? ` — ${inr(remaining)} unallocated` : ""}`,
            },
          },
        },
        include: {
          customer: true,
          payments: { include: { invoice: true } },
          activityLogs: { orderBy: { createdAt: "asc" } },
        },
      });

      // Auto-generate receipt on first reconciliation
      const existing = await tx.receipt.findUnique({ where: { transactionId: txn.id } });
      if (!existing) {
        const count = await tx.receipt.count();
        const receiptNumber = `REC-${String(count + 1).padStart(4, "0")}`;
        await tx.receipt.create({ data: { receiptNumber, transactionId: txn.id } });
      }

      return updatedTxn;
    });

    const receipt = await prisma.receipt.findUnique({ where: { transactionId: result.id } });

    res.json({ ...result, receipt });
  } catch (err) {
    next(err);
  }
});

export default router;
