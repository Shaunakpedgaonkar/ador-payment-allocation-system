import { prisma } from "./db.js";

async function main() {
  // Clear in dependency order
  await prisma.receipt.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.customer.deleteMany();

  // Reset SQLite auto-increment so IDs always start from 1
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM sqlite_sequence WHERE name IN ('Customer','Invoice','Transaction','InvoicePayment','ActivityLog','Receipt')`
    );
  } catch (_) { /* sqlite_sequence only exists after first-ever insert */ }

  // ── Customers ────────────────────────────────────────────────────────────────
  const [reliance, hpcl, lt, tata, bhel, jsw] = await Promise.all([
    prisma.customer.create({ data: { name: "Reliance Industries Ltd",  aliases: "RELIANCE,Reliance Ind,RIL,Reliance Inds" } }),
    prisma.customer.create({ data: { name: "Hindustan Petroleum Corp", aliases: "HPCL,HP Corp,Hindustan Petro,HPCL LTD" } }),
    prisma.customer.create({ data: { name: "Larsen & Toubro Ltd",      aliases: "L&T,LnT,LT,Larsen Toubro,LT LTD" } }),
    prisma.customer.create({ data: { name: "Tata Steel Ltd",           aliases: "TATA STEEL,Tata Stl,TSL,TATA STL" } }),
    prisma.customer.create({ data: { name: "Bharat Heavy Electricals", aliases: "BHEL,Bharat Elect,BHE Ltd,BHEL LTD" } }),
    prisma.customer.create({ data: { name: "JSW Steel Ltd",            aliases: "JSW,JSW STEEL,JSWSTEEL,JSW STL" } }),
  ]);

  // ── Invoices ─────────────────────────────────────────────────────────────────
  // createdAt drives aging buckets in the UI:
  //   < 1 month  → Apr entries
  //   1–2 months → Mar entries
  //   2–3 months → Feb entries
  //   3+ months  → Jan and older
  const [
    inv2401, inv2402,       // Reliance
    inv2403, inv2404,       // HPCL
    inv2405, inv2406,       // L&T
    inv2407, inv2408,       // Tata Steel
    inv2409, inv2410,       // BHEL
    inv2411, inv2412,       // JSW Steel
  ] = await Promise.all([
    // Reliance Industries — 80k partial, 250k fully open
    prisma.invoice.create({ data: { customerId: reliance.id, invoiceNumber: "INV-2401", amount: 120000, balanceRemaining:  40000, dueDate: new Date("2026-03-15"), status: "PARTIAL", createdAt: new Date("2026-01-15") } }),
    prisma.invoice.create({ data: { customerId: reliance.id, invoiceNumber: "INV-2402", amount: 250000, balanceRemaining: 250000, dueDate: new Date("2026-04-30"), status: "OPEN",    createdAt: new Date("2026-02-10") } }),
    // HPCL — one fully settled, one partial
    prisma.invoice.create({ data: { customerId: hpcl.id,     invoiceNumber: "INV-2403", amount:  85000, balanceRemaining:      0, dueDate: new Date("2026-02-28"), status: "PAID",    createdAt: new Date("2026-01-05") } }),
    prisma.invoice.create({ data: { customerId: hpcl.id,     invoiceNumber: "INV-2404", amount: 175000, balanceRemaining:  75000, dueDate: new Date("2026-04-15"), status: "PARTIAL", createdAt: new Date("2026-02-20") } }),
    // L&T — one settled, one open
    prisma.invoice.create({ data: { customerId: lt.id,       invoiceNumber: "INV-2405", amount: 350000, balanceRemaining:      0, dueDate: new Date("2026-03-01"), status: "PAID",    createdAt: new Date("2025-12-01") } }),
    prisma.invoice.create({ data: { customerId: lt.id,       invoiceNumber: "INV-2406", amount: 200000, balanceRemaining:  50000, dueDate: new Date("2026-05-31"), status: "PARTIAL", createdAt: new Date("2026-03-15") } }),
    // Tata Steel — one partial, one open
    prisma.invoice.create({ data: { customerId: tata.id,     invoiceNumber: "INV-2407", amount:  95000, balanceRemaining:  50000, dueDate: new Date("2026-03-20"), status: "PARTIAL", createdAt: new Date("2026-01-20") } }),
    prisma.invoice.create({ data: { customerId: tata.id,     invoiceNumber: "INV-2408", amount: 150000, balanceRemaining: 150000, dueDate: new Date("2026-05-15"), status: "OPEN",    createdAt: new Date("2026-03-25") } }),
    // BHEL — one settled, one large open
    prisma.invoice.create({ data: { customerId: bhel.id,     invoiceNumber: "INV-2409", amount: 280000, balanceRemaining:      0, dueDate: new Date("2026-02-15"), status: "PAID",    createdAt: new Date("2025-11-20") } }),
    prisma.invoice.create({ data: { customerId: bhel.id,     invoiceNumber: "INV-2410", amount: 420000, balanceRemaining: 420000, dueDate: new Date("2026-06-30"), status: "OPEN",    createdAt: new Date("2026-04-10") } }),
    // JSW Steel — two open invoices
    prisma.invoice.create({ data: { customerId: jsw.id,      invoiceNumber: "INV-2411", amount: 380000, balanceRemaining: 180000, dueDate: new Date("2026-04-20"), status: "PARTIAL", createdAt: new Date("2026-02-15") } }),
    prisma.invoice.create({ data: { customerId: jsw.id,      invoiceNumber: "INV-2412", amount: 160000, balanceRemaining: 160000, dueDate: new Date("2026-06-15"), status: "OPEN",    createdAt: new Date("2026-04-05") } }),
  ]);

  // ── Transactions ─────────────────────────────────────────────────────────────
  // Narrations are intentionally messy (aliases, typos, short codes) to
  // demonstrate real-world bank statement matching.

  // ── RECONCILED (payment received + allocated to invoice) ─────────────────────
  const txn1 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-01-20"), amount:  80000,
    narration: "RTGS CR RELIANCE IND LTD MUMBAI INV2401",
    reference: "RTGS2601001", branch: "Mumbai HQ",
    customerId: reliance.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});
  const txn2 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-02-05"), amount:  85000,
    narration: "RTGS TRF HPCL CHENNAI INV2403 SETTLEMENT",
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
    txnDate: new Date("2026-03-10"), amount:  45000,
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
  const txn11 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-03-22"), amount: 200000,
    narration: "RTGS JSW STEEL MUMBAI PART PYMT INV2411",
    reference: "RTGS2603022", branch: "Mumbai HQ",
    customerId: jsw.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});
  const txn12 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-03-28"), amount: 150000,
    narration: "NEFT LT INFRA DIV DELHI PART INV2406",
    reference: "NEFT2603028", branch: "Delhi NCR",
    customerId: lt.id, matchConfidence: "HIGH", matchType: "AUTO", status: "RECONCILED",
  }});

  // ── MATCHED (customer identified, awaiting invoice allocation) ────────────────
  const txn7 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-02"), amount: 500000,
    narration: "RTGS RELIANCE INDUSTRIES LTD MUMBAI APR PYMT",
    reference: "RTGS2604002", branch: "Mumbai HQ",
    customerId: reliance.id, matchConfidence: "HIGH", matchType: "AUTO", status: "MATCHED",
  }});
  const txn8 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-08"), amount: 180000,
    narration: "NEFT JSWSTEEL LTD DELHI ADVANCE APR",
    reference: "NEFT2604008", branch: "Delhi NCR",
    customerId: jsw.id, matchConfidence: "HIGH", matchType: "AUTO", status: "MATCHED",
  }});
  const txn13 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-12"), amount: 420000,
    narration: "RTGS BHEL HYDERABAD INV2410 ADVANCE",
    reference: "RTGS2604012", branch: "Hyderabad",
    customerId: bhel.id, matchConfidence: "HIGH", matchType: "AUTO", status: "MATCHED",
  }});
  const txn14 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-14"), amount: 150000,
    narration: "NEFT TATA STL MFG PUNE INV2408 PART",
    reference: "NEFT2604014", branch: "Pune",
    customerId: tata.id, matchConfidence: "MEDIUM", matchType: "AUTO", status: "MATCHED",
  }});

  // ── UNMATCHED (no customer identified — requires manual assignment) ────────────
  const txn9 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-16"), amount:  50000,
    narration: "IMPS RELIANCE PART P...",
    reference: "IMPS106", branch: "Mumbai",
    status: "UNMATCHED",
  }});
  const txn10 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-15"), amount:  65000,
    narration: "NEFT UNKNOWN PETROLEUM MUMBAI REF441",
    reference: "NEFT2604015", branch: "Mumbai HQ",
    status: "UNMATCHED",
  }});
  const txn15 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-17"), amount:  30000,
    narration: "NEFT CR MISC INDUSTRIAL DELHI",
    reference: "NEFT2604017", branch: "Delhi NCR",
    status: "UNMATCHED",
  }});
  const txn16 = await prisma.transaction.create({ data: {
    txnDate: new Date("2026-04-18"), amount:  10000,
    narration: "CASH CREDIT UNKNOWN COMPANY CHENNAI",
    reference: "CASH109", branch: "Chennai Branch",
    status: "UNMATCHED",
  }});

  // ── Invoice Payments ──────────────────────────────────────────────────────────
  await Promise.all([
    prisma.invoicePayment.create({ data: { transactionId: txn1.id,  invoiceId: inv2401.id, amountApplied:  80000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn2.id,  invoiceId: inv2403.id, amountApplied:  85000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn3.id,  invoiceId: inv2404.id, amountApplied: 100000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn4.id,  invoiceId: inv2405.id, amountApplied: 350000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn5.id,  invoiceId: inv2407.id, amountApplied:  45000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn6.id,  invoiceId: inv2409.id, amountApplied: 280000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn11.id, invoiceId: inv2411.id, amountApplied: 200000 } }),
    prisma.invoicePayment.create({ data: { transactionId: txn12.id, invoiceId: inv2406.id, amountApplied: 150000 } }),
  ]);

  // ── Activity Logs ─────────────────────────────────────────────────────────────
  const logs = [
    { txn: txn1,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn1,  action: "MATCHED",    desc: "Auto-matched to Reliance Industries Ltd (HIGH confidence)" },
    { txn: txn1,  action: "RECONCILED", desc: "Reconciled ₹80,000 → INV-2401 (partial payment)" },
    { txn: txn2,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Chennai Branch" },
    { txn: txn2,  action: "MATCHED",    desc: "Auto-matched to Hindustan Petroleum Corp (HIGH confidence)" },
    { txn: txn2,  action: "RECONCILED", desc: "Reconciled ₹85,000 → INV-2403 (full settlement)" },
    { txn: txn3,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Chennai Branch" },
    { txn: txn3,  action: "MATCHED",    desc: "Auto-matched to Hindustan Petroleum Corp (HIGH confidence)" },
    { txn: txn3,  action: "RECONCILED", desc: "Reconciled ₹1,00,000 → INV-2404 (partial payment)" },
    { txn: txn4,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Delhi NCR" },
    { txn: txn4,  action: "MATCHED",    desc: "Auto-matched to Larsen & Toubro Ltd (HIGH confidence)" },
    { txn: txn4,  action: "RECONCILED", desc: "Reconciled ₹3,50,000 → INV-2405 (full settlement)" },
    { txn: txn5,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn5,  action: "MATCHED",    desc: "Auto-matched to Tata Steel Ltd (MEDIUM confidence)" },
    { txn: txn5,  action: "RECONCILED", desc: "Reconciled ₹45,000 → INV-2407 (partial payment)" },
    { txn: txn6,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn6,  action: "MATCHED",    desc: "Auto-matched to Bharat Heavy Electricals (HIGH confidence)" },
    { txn: txn6,  action: "RECONCILED", desc: "Reconciled ₹2,80,000 → INV-2409 (full settlement)" },
    { txn: txn11, action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn11, action: "MATCHED",    desc: "Auto-matched to JSW Steel Ltd (HIGH confidence)" },
    { txn: txn11, action: "RECONCILED", desc: "Reconciled ₹2,00,000 → INV-2411 (partial payment)" },
    { txn: txn12, action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Delhi NCR" },
    { txn: txn12, action: "MATCHED",    desc: "Auto-matched to Larsen & Toubro Ltd (HIGH confidence)" },
    { txn: txn12, action: "RECONCILED", desc: "Reconciled ₹1,50,000 → INV-2406 (partial payment)" },
    { txn: txn7,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn7,  action: "MATCHED",    desc: "Auto-matched to Reliance Industries Ltd (HIGH confidence)" },
    { txn: txn8,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Delhi NCR" },
    { txn: txn8,  action: "MATCHED",    desc: "Auto-matched to JSW Steel Ltd (HIGH confidence)" },
    { txn: txn13, action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Hyderabad" },
    { txn: txn13, action: "MATCHED",    desc: "Auto-matched to Bharat Heavy Electricals (HIGH confidence)" },
    { txn: txn14, action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Pune" },
    { txn: txn14, action: "MATCHED",    desc: "Auto-matched to Tata Steel Ltd (MEDIUM confidence)" },
    { txn: txn9,  action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Mumbai" },
    { txn: txn10, action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Mumbai HQ" },
    { txn: txn15, action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Delhi NCR" },
    { txn: txn16, action: "UPLOADED",   desc: "Uploaded via bank statement CSV · Chennai Branch" },
  ];

  for (const e of logs) {
    await prisma.activityLog.create({
      data: { transactionId: e.txn.id, action: e.action, description: e.desc },
    });
  }

  // ── Receipts (one per RECONCILED transaction) ─────────────────────────────────
  await Promise.all([
    prisma.receipt.create({ data: { receiptNumber: "REC-0001", transactionId: txn1.id  } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0002", transactionId: txn2.id  } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0003", transactionId: txn3.id  } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0004", transactionId: txn4.id  } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0005", transactionId: txn5.id  } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0006", transactionId: txn6.id  } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0007", transactionId: txn11.id } }),
    prisma.receipt.create({ data: { receiptNumber: "REC-0008", transactionId: txn12.id } }),
  ]);

  console.log(
    "Seeded: 6 customers · 12 invoices · 16 transactions " +
    "(8 reconciled, 4 matched, 4 unmatched) · 8 receipts"
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); process.exit(0); });
