import { prisma } from "./db.js";

async function main() {
  // Clear in dependency order
  await prisma.receipt.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.customer.deleteMany();

  // ── Customers (ADOR industrial ecosystem) ────────────────────────────────────
  const [awl, hpcl, lt, tata, bhel] = await Promise.all([
    prisma.customer.create({
      data: { name: "Ador Welding Ltd", aliases: "AWL,Ador Weld,Ador Welding" },
    }),
    prisma.customer.create({
      data: { name: "Hindustan Petroleum Corp", aliases: "HPCL,HP Corp,Hindustan Petro" },
    }),
    prisma.customer.create({
      data: { name: "Larsen & Toubro Ltd", aliases: "L&T,LnT,LT,Larsen Toubro" },
    }),
    prisma.customer.create({
      data: { name: "Tata Steel Ltd", aliases: "TATA STEEL,Tata Stl,TSL" },
    }),
    prisma.customer.create({
      data: { name: "Bharat Heavy Electricals", aliases: "BHEL,Bharat Elect,BHE Ltd" },
    }),
  ]);

  // ── Invoices ─────────────────────────────────────────────────────────────────
  // balanceRemaining is set to reflect pre-seeded payment state
  // Current demo date: 2026-04-28
  // createdAt drives aging calculation in the UI — set to spread across buckets:
  //   < 1 month  → INV-2410 (Apr 10)
  //   1–2 months → INV-2406 (Mar 15), INV-2408 (Mar 25)
  //   2–3 months → INV-2402 (Feb 10), INV-2404 (Feb 20)
  //   3+ months  → INV-2401 (Jan 15), INV-2403 (Jan 05), INV-2407 (Jan 20),
  //                INV-2405 (Dec 01), INV-2409 (Nov 20)
  const [
    inv2401, inv2402,             // Ador Welding
    inv2403, inv2404,             // HPCL
    inv2405, inv2406,             // L&T
    inv2407, inv2408,             // Tata Steel
    inv2409, inv2410,             // BHEL
  ] = await Promise.all([
    // Ador Welding
    prisma.invoice.create({ data: { customerId: awl.id,  invoiceNumber: "INV-2401", amount: 120000, balanceRemaining:  40000, dueDate: new Date("2026-03-15"), status: "PARTIAL", createdAt: new Date("2026-01-15") } }),
    prisma.invoice.create({ data: { customerId: awl.id,  invoiceNumber: "INV-2402", amount: 250000, balanceRemaining: 250000, dueDate: new Date("2026-04-30"), status: "OPEN",    createdAt: new Date("2026-02-10") } }),
    // HPCL
    prisma.invoice.create({ data: { customerId: hpcl.id, invoiceNumber: "INV-2403", amount:  85000, balanceRemaining:      0, dueDate: new Date("2026-02-28"), status: "PAID",    createdAt: new Date("2026-01-05") } }),
    prisma.invoice.create({ data: { customerId: hpcl.id, invoiceNumber: "INV-2404", amount: 175000, balanceRemaining:  75000, dueDate: new Date("2026-04-15"), status: "PARTIAL", createdAt: new Date("2026-02-20") } }),
    // L&T
    prisma.invoice.create({ data: { customerId: lt.id,   invoiceNumber: "INV-2405", amount: 350000, balanceRemaining:      0, dueDate: new Date("2026-03-01"), status: "PAID",    createdAt: new Date("2025-12-01") } }),
    prisma.invoice.create({ data: { customerId: lt.id,   invoiceNumber: "INV-2406", amount: 200000, balanceRemaining: 200000, dueDate: new Date("2026-05-31"), status: "OPEN",    createdAt: new Date("2026-03-15") } }),
    // Tata Steel
    prisma.invoice.create({ data: { customerId: tata.id, invoiceNumber: "INV-2407", amount:  95000, balanceRemaining:  50000, dueDate: new Date("2026-03-20"), status: "PARTIAL", createdAt: new Date("2026-01-20") } }),
    prisma.invoice.create({ data: { customerId: tata.id, invoiceNumber: "INV-2408", amount: 150000, balanceRemaining: 150000, dueDate: new Date("2026-05-15"), status: "OPEN",    createdAt: new Date("2026-03-25") } }),
    // BHEL
    prisma.invoice.create({ data: { customerId: bhel.id, invoiceNumber: "INV-2409", amount: 280000, balanceRemaining:      0, dueDate: new Date("2026-02-15"), status: "PAID",    createdAt: new Date("2025-11-20") } }),
    prisma.invoice.create({ data: { customerId: bhel.id, invoiceNumber: "INV-2410", amount: 420000, balanceRemaining: 420000, dueDate: new Date("2026-06-30"), status: "OPEN",    createdAt: new Date("2026-04-10") } }),
  ]);

  // ── Transactions ─────────────────────────────────────────────────────────────
  // Narrations are intentionally messy — aliases, typos, short codes — to
  // demonstrate that the matching engine handles real-world bank statement text.

  // 6 RECONCILED — money received and allocated to invoices
  const txn1 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-01-20"), amount: 80000,
    narration: "NEFT CR AWL MUMBAI 20012026",
    reference: "NEFT2601001", branch: "Mumbai HQ",
    customerId: awl.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});

  const txn2 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-02-05"), amount: 85000,
    narration: "RTGS TRF HPCL CHNNAI INV2403 SETTLEMENT",
    reference: "RTGS2602005", branch: "Chennai Branch",
    customerId: hpcl.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});

  const txn3 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-02-18"), amount: 100000,
    narration: "NEFT HPCL PART PMT INV2404 CHENAI",
    reference: "NEFT2602018", branch: "Chennai Branch",
    customerId: hpcl.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});

  const txn4 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-02-28"), amount: 350000,
    narration: "RTGS LNT LTD DELHI 2405 FULL SETTLEMENT",
    reference: "RTGS2602028", branch: "Delhi NCR",
    customerId: lt.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});

  const txn5 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-03-10"), amount: 45000,
    narration: "NEFT TSL STEEL MFG PART PYMT INV2407",
    reference: "NEFT2603010", branch: "Mumbai HQ",
    customerId: tata.id, matchConfidence: "MEDIUM", matchType: "AUTO", status: "RECONCILED",
  }});

  const txn6 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-03-15"), amount: 280000,
    narration: "RTGS BHEL BHOPAL TRF INV2409 FULL",
    reference: "RTGS2603015", branch: "Mumbai HQ",
    customerId: bhel.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});

  // 2 MATCHED — money received, customer identified, awaiting invoice allocation
  const txn7 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-02"), amount: 40000,
    narration: "NEFT AWL MUMBAI ADVANCE TRF 04APR",
    reference: "NEFT2604002", branch: "Mumbai HQ",
    customerId: awl.id, matchConfidence: "HIGH", matchType: "AUTO", status: "MATCHED",
  }});

  const txn8 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-10"), amount: 150000,
    narration: "RTGS LT INFRA SERVICES DELHI PYMT",
    reference: "RTGS2604010", branch: "Delhi NCR",
    customerId: lt.id, matchConfidence: "MEDIUM", matchType: "AUTO", status: "MATCHED",
  }});

  // 2 UNMATCHED — no customer identified; handled in Transactions page only
  const txn9 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-12"), amount: 30000,
    narration: "NEFT UNKNOWN COMPANY DELHI REF998",
    reference: "NEFT2604012", branch: "Delhi NCR",
    status: "UNMATCHED",
  }});

  const txn10 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-15"), amount: 15000,
    narration: "NEFT CR MISC RCVR MUMBAI 15APR",
    reference: "NEFT2604015", branch: "Mumbai HQ",
    status: "UNMATCHED",
  }});

  // ── Invoice Payments (links RECONCILED txns → invoices) ──────────────────────
  await Promise.all([
    prisma.invoicePayment.create({ data: { transactionId: txn1.id, invoiceId: inv2401.id, amountApplied:  80000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn2.id, invoiceId: inv2403.id, amountApplied:  85000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn3.id, invoiceId: inv2404.id, amountApplied: 100000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn4.id, invoiceId: inv2405.id, amountApplied: 350000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn5.id, invoiceId: inv2407.id, amountApplied:  45000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn6.id, invoiceId: inv2409.id, amountApplied: 280000 } }),
  ]);

  // ── Activity Logs ─────────────────────────────────────────────────────────────
  const logs = [
    { txn: txn1,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn1,  action: "MATCHED",     desc: "Auto-matched to Ador Welding Ltd (HIGH confidence)" },
    { txn: txn1,  action: "RECONCILED",  desc: "Reconciled ₹80,000 → INV-2401 (partial payment)" },
    { txn: txn2,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Chennai Branch" },
    { txn: txn2,  action: "MATCHED",     desc: "Auto-matched to Hindustan Petroleum Corp (HIGH confidence)" },
    { txn: txn2,  action: "RECONCILED",  desc: "Reconciled ₹85,000 → INV-2403 (full settlement)" },
    { txn: txn3,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Chennai Branch" },
    { txn: txn3,  action: "MATCHED",     desc: "Auto-matched to Hindustan Petroleum Corp (HIGH confidence)" },
    { txn: txn3,  action: "RECONCILED",  desc: "Reconciled ₹1,00,000 → INV-2404 (partial payment)" },
    { txn: txn4,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Delhi NCR" },
    { txn: txn4,  action: "MATCHED",     desc: "Auto-matched to Larsen & Toubro Ltd (HIGH confidence)" },
    { txn: txn4,  action: "RECONCILED",  desc: "Reconciled ₹3,50,000 → INV-2405 (full settlement)" },
    { txn: txn5,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn5,  action: "MATCHED",     desc: "Auto-matched to Tata Steel Ltd (MEDIUM confidence)" },
    { txn: txn5,  action: "RECONCILED",  desc: "Reconciled ₹45,000 → INV-2407 (partial payment)" },
    { txn: txn6,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn6,  action: "MATCHED",     desc: "Auto-matched to Bharat Heavy Electricals (HIGH confidence)" },
    { txn: txn6,  action: "RECONCILED",  desc: "Reconciled ₹2,80,000 → INV-2409 (full settlement)" },
    { txn: txn7,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn7,  action: "MATCHED",     desc: "Auto-matched to Ador Welding Ltd (HIGH confidence)" },
    { txn: txn8,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Delhi NCR" },
    { txn: txn8,  action: "MATCHED",     desc: "Auto-matched to Larsen & Toubro Ltd (MEDIUM confidence)" },
    { txn: txn9,  action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Delhi NCR" },
    { txn: txn10, action: "UPLOADED",    desc: "Uploaded via bank statement CSV · Mumbai HQ" },
  ];

  for (const e of logs) {
    await prisma.activityLog.create({
      data: { transactionId: e.txn.id, action: e.action, description: e.desc },
    });
  }

  // ── Receipts (one per RECONCILED transaction) ─────────────────────────────────
  await Promise.all([
    prisma.receipt.create({ data: { receiptNumber: "REC-0001", transactionId: txn1.id } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0002", transactionId: txn2.id } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0003", transactionId: txn3.id } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0004", transactionId: txn4.id } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0005", transactionId: txn5.id } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0006", transactionId: txn6.id } }),
  ]);

  console.log(
    "Seeded ADOR demo data: 5 customers · 10 invoices · 10 transactions " +
    "(6 reconciled, 2 matched, 2 unmatched) · 6 receipts"
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); process.exit(0); });
