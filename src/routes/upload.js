import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../db.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const BRANCHES = ["Mumbai HQ", "Delhi NCR", "Pune Branch", "Bengaluru", "Chennai"];

function parseDate(value) {
  if (!value) return new Date();
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  const m = String(value).match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return new Date();
}

function parseAmount(value) {
  if (value === undefined || value === null) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const text = req.file.buffer.toString("utf8");
    const records = parse(text, {
      columns: (header) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });

    const rows = records.map((r, i) => ({
      txnDate: parseDate(r.date || r.txn_date || r.transaction_date),
      amount: parseAmount(r.amount),
      narration: r.narration || r.description || r.particulars || "",
      reference: r.reference || r.ref || null,
      branch: r.branch || BRANCHES[i % BRANCHES.length],
    }));

    const created = await prisma.$transaction(async (tx) => {
      // Reset: clear all transaction-related data and restore invoice balances
      await tx.receipt.deleteMany({});
      await tx.activityLog.deleteMany({});
      await tx.invoicePayment.deleteMany({});
      await tx.transaction.deleteMany({});
      const invoices = await tx.invoice.findMany();
      await Promise.all(
        invoices.map((inv) =>
          tx.invoice.update({
            where: { id: inv.id },
            data: { balanceRemaining: inv.amount, status: "OPEN" },
          })
        )
      );

      // Insert new transactions
      return Promise.all(
        rows.map((row) =>
          tx.transaction.create({
            data: {
              ...row,
              activityLogs: {
                create: {
                  action: "UPLOADED",
                  description: `Transaction imported from CSV — ${row.narration}`,
                },
              },
            },
          })
        )
      );
    });

    res.json({ inserted: created.length, transactions: created });
  } catch (err) {
    next(err);
  }
});

export default router;
