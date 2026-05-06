import express from "express";
import { SavingsRecord } from "../models/SavingsRecord.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { amount, date, screenshot } = req.body;

    const normalizedScreenshot = typeof screenshot === "string" ? screenshot.trim() : "";

    const recordPayload: Record<string, unknown> = {
      userId,
      amount,
      date: new Date(date),
    };

    // Always persist a non-empty value to avoid required-string validator crashes
    // in stale dev processes that may still hold an older schema in memory.
    recordPayload.screenshot = normalizedScreenshot || "NO_SCREENSHOT";

    const record = new SavingsRecord(recordPayload);
    
    await record.save();
    res.status(201).json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add savings record" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const records = await SavingsRecord.find({ userId }).sort({ date: -1 });
    res.status(200).json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

router.get("/report", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const period = String(req.query.period || "monthly");

    const now = new Date();
    const from = new Date(now);

    if (period === "weekly") {
      from.setDate(now.getDate() - 7);
    } else if (period === "monthly") {
      from.setMonth(now.getMonth() - 1);
    } else if (period === "yearly") {
      from.setFullYear(now.getFullYear() - 1);
    } else {
      return res.status(400).json({ error: "Invalid period. Use weekly, monthly, or yearly." });
    }

    const records = await SavingsRecord.find({
      userId,
      date: { $gte: from },
    }).sort({ date: -1 });

    const totalSavings = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);

    res.status(200).json({
      period,
      generatedAt: new Date().toISOString(),
      totalSavings,
      recordCount: records.length,
      records,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate report data" });
  }
});

export default router;
