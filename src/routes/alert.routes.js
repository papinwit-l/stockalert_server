const express = require("express");
const prisma = require("../config/database");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const VALID_CONDITIONS = [
  "PRICE_ABOVE",
  "PRICE_BELOW",
  "PERCENT_UP",
  "PERCENT_DOWN",
  "VOLUME_SPIKE",
];
const VALID_MODES = ["ONCE", "REPEAT"];

// All routes require auth
router.use(authMiddleware);

// GET /api/alerts - list user's alerts
router.get("/", async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { userId: req.userId },
      include: {
        stock: { select: { symbol: true, name: true, lastPrice: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(alerts);
  } catch (error) {
    console.error("[Alerts] List error:", error.message);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// POST /api/alerts - create a new alert
router.post("/", async (req, res) => {
  try {
    const {
      symbol,
      condition,
      threshold,
      notifyMode = "REPEAT",
      buffer = 1.0,
      cooldown = null,
    } = req.body;

    // Validate
    if (!symbol || !condition || threshold === undefined) {
      return res
        .status(400)
        .json({ error: "symbol, condition, and threshold are required" });
    }

    if (!VALID_CONDITIONS.includes(condition)) {
      return res
        .status(400)
        .json({ error: `Invalid condition. Use: ${VALID_CONDITIONS.join(", ")}` });
    }

    if (!VALID_MODES.includes(notifyMode)) {
      return res
        .status(400)
        .json({ error: `Invalid notifyMode. Use: ${VALID_MODES.join(", ")}` });
    }

    // Find stock
    const upperSymbol = symbol.toUpperCase().trim();
    const stock = await prisma.stock.findUnique({
      where: { symbol: upperSymbol },
    });

    if (!stock) {
      return res
        .status(404)
        .json({ error: `Stock ${upperSymbol} not found. Add it to your watchlist first.` });
    }

    const alert = await prisma.alert.create({
      data: {
        userId: req.userId,
        stockId: stock.id,
        condition,
        threshold: parseFloat(threshold),
        notifyMode,
        buffer: parseFloat(buffer),
        cooldown: cooldown ? parseInt(cooldown) : null,
      },
      include: {
        stock: { select: { symbol: true, name: true } },
      },
    });

    res.status(201).json(alert);
  } catch (error) {
    console.error("[Alerts] Create error:", error.message);
    res.status(500).json({ error: "Failed to create alert" });
  }
});

// PATCH /api/alerts/:id - update an alert
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { condition, threshold, notifyMode, buffer, cooldown, isActive } =
      req.body;

    // Verify ownership
    const existing = await prisma.alert.findFirst({
      where: { id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const updateData = {};
    if (condition !== undefined) {
      if (!VALID_CONDITIONS.includes(condition)) {
        return res.status(400).json({ error: "Invalid condition" });
      }
      updateData.condition = condition;
    }
    if (threshold !== undefined) updateData.threshold = parseFloat(threshold);
    if (notifyMode !== undefined) {
      if (!VALID_MODES.includes(notifyMode)) {
        return res.status(400).json({ error: "Invalid notifyMode" });
      }
      updateData.notifyMode = notifyMode;
    }
    if (buffer !== undefined) updateData.buffer = parseFloat(buffer);
    if (cooldown !== undefined)
      updateData.cooldown = cooldown ? parseInt(cooldown) : null;
    if (isActive !== undefined) {
      updateData.isActive = isActive;
      // Re-arm when reactivating
      if (isActive) updateData.isArmed = true;
    }

    const alert = await prisma.alert.update({
      where: { id },
      data: updateData,
      include: {
        stock: { select: { symbol: true, name: true } },
      },
    });

    res.json(alert);
  } catch (error) {
    console.error("[Alerts] Update error:", error.message);
    res.status(500).json({ error: "Failed to update alert" });
  }
});

// DELETE /api/alerts/:id - delete an alert
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.alert.findFirst({
      where: { id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Alert not found" });
    }

    await prisma.alert.delete({ where: { id } });

    res.json({ message: "Alert deleted" });
  } catch (error) {
    console.error("[Alerts] Delete error:", error.message);
    res.status(500).json({ error: "Failed to delete alert" });
  }
});

module.exports = router;
