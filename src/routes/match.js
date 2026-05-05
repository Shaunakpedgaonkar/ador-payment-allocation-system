import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// ─── Token extraction ────────────────────────────────────────────────────────

function tokensForCustomer(customer) {
  const tokens = [customer.name];
  if (customer.aliases) {
    tokens.push(...customer.aliases.split(",").map((a) => a.trim()).filter(Boolean));
  }
  return tokens.map((t) => t.toLowerCase()).filter((t) => t.length >= 3);
}

// ─── Scoring engine ──────────────────────────────────────────────────────────
//
// Score = Name Match (0–50) + Amount Match (0–30) + Reference Match (0–20)
// Minimum score to accept a match: 15 (at least a short name token)
//
// Name match weights:
//   token length ≥ 9 → 50   (full name like "acme industries")
//   token length ≥ 6 → 40   (long alias like "globex")
//   token length ≥ 4 → 25   (medium alias like "acme")
//   token length ≥ 3 → 15   (short alias like "abc")
//
// Amount match weights:
//   txn.amount == invoice.balanceRemaining (±1) → 30  (exact match)
//   txn.amount within [80%–120%] of invoice.amount  → 15  (close match)
//
// Reference match weights:
//   txn.reference contains invoice number             → 20
//   txn.narration contains invoice number             → 10

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreCustomer(txn, customer, invoices) {
  const hay = `${txn.narration} ${txn.reference || ""}`.toLowerCase();
  const tokens = tokensForCustomer(customer);

  // ── Name score ──
  let nameScore = 0;
  let bestToken = null;
  for (const tok of tokens) {
    if (hay.includes(tok) && tok.length > (bestToken?.length ?? 0)) {
      bestToken = tok;
    }
  }
  if (bestToken) {
    const len = bestToken.length;
    if (len >= 9) nameScore = 50;
    else if (len >= 6) nameScore = 40;
    else if (len >= 4) nameScore = 25;
    else nameScore = 15;
  }

  // ── Amount score ──
  let amountScore = 0;
  const txnRef = normalize(txn.reference);
  const txnNarr = normalize(txn.narration);
  for (const inv of invoices) {
    // Exact balance match
    if (Math.abs(inv.balanceRemaining - txn.amount) < 1) {
      amountScore = Math.max(amountScore, 30);
      break;
    }
    // Within 20% of invoice face value
    const ratio = txn.amount / inv.amount;
    if (ratio >= 0.8 && ratio <= 1.2) {
      amountScore = Math.max(amountScore, 15);
    }
  }

  // ── Reference / invoice-number score ──
  let refScore = 0;
  for (const inv of invoices) {
    const invNum = normalize(inv.invoiceNumber);
    if (invNum.length < 3) continue;
    if (txnRef && txnRef.includes(invNum)) { refScore = 20; break; }
    if (txnNarr.includes(invNum))          { refScore = Math.max(refScore, 10); }
  }

  const total = nameScore + amountScore + refScore;
  return { score: total, bestToken, nameScore, amountScore, refScore };
}

function confidenceFromScore(score) {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 15) return "LOW";
  return null;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post("/", async (_req, res, next) => {
  try {
    const [customers, unmatched, openInvoices] = await Promise.all([
      prisma.customer.findMany(),
      prisma.transaction.findMany({ where: { status: "UNMATCHED" } }),
      prisma.invoice.findMany({ where: { status: { not: "PAID" } } }),
    ]);

    // Group invoices by customer for fast lookup
    const invoicesByCustomer = {};
    for (const inv of openInvoices) {
      (invoicesByCustomer[inv.customerId] ??= []).push(inv);
    }

    let matchedCount = 0;
    const updates = [];

    for (const txn of unmatched) {
      let bestCustomer = null;
      let bestScore = 0;
      let bestMeta = null;

      for (const customer of customers) {
        const invoices = invoicesByCustomer[customer.id] ?? [];
        const meta = scoreCustomer(txn, customer, invoices);
        if (meta.score > bestScore) {
          bestScore = meta.score;
          bestCustomer = customer;
          bestMeta = meta;
        }
      }

      const confidence = confidenceFromScore(bestScore);
      if (!confidence) continue; // score too low — leave UNMATCHED

      matchedCount += 1;
      const breakdown = `name:${bestMeta.nameScore} + amount:${bestMeta.amountScore} + ref:${bestMeta.refScore} = ${bestScore}`;
      updates.push(
        prisma.transaction.update({
          where: { id: txn.id },
          data: {
            customerId: bestCustomer.id,
            status: "MATCHED",
            matchConfidence: confidence,
            matchType: "AUTO",
            activityLogs: {
              create: {
                action: "MATCHED_AUTO",
                description: `Auto-matched to ${bestCustomer.name} via "${bestMeta.bestToken}" — score ${bestScore} (${breakdown}) — confidence ${confidence}`,
              },
            },
          },
        })
      );
    }

    await prisma.$transaction(updates);

    res.json({
      scanned: unmatched.length,
      matched: matchedCount,
      stillUnmatched: unmatched.length - matchedCount,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/manual", async (req, res, next) => {
  try {
    const { transactionId, customerId } = req.body;
    if (!transactionId || !customerId) {
      return res.status(400).json({ error: "transactionId and customerId required" });
    }
    const customer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
    const txn = await prisma.transaction.update({
      where: { id: Number(transactionId) },
      data: {
        customerId: Number(customerId),
        status: "MATCHED",
        matchConfidence: "HIGH",
        matchType: "MANUAL",
        activityLogs: {
          create: {
            action: "MATCHED_MANUAL",
            description: `Manually assigned to ${customer?.name || "customer #" + customerId}`,
          },
        },
      },
      include: { customer: true },
    });
    res.json(txn);
  } catch (err) {
    next(err);
  }
});

export default router;
