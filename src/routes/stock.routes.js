const express = require("express");
const prisma = require("../config/database");
const { fetchQuote } = require("../services/finnhub.service");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// GET /api/stocks - list all stocks in user's watchlist
router.get("/", async (req, res) => {
  try {
    const watchlist = await prisma.watchlist.findMany({
      where: { userId: req.userId },
      include: { stock: true },
      orderBy: { createdAt: "desc" },
    });

    const stocks = watchlist.map((w) => w.stock);
    res.json(stocks);
  } catch (error) {
    console.error("[Stocks] List error:", error.message);
    res.status(500).json({ error: "Failed to fetch stocks" });
  }
});

// POST /api/stocks/watch - add a stock to watchlist
router.post("/watch", async (req, res) => {
  try {
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const upperSymbol = symbol.toUpperCase().trim();

    // Find or create the stock
    let stock = await prisma.stock.findUnique({
      where: { symbol: upperSymbol },
    });

    if (!stock) {
      // Fetch from Finnhub to validate and get initial data
      const quote = await fetchQuote(upperSymbol);

      stock = await prisma.stock.create({
        data: {
          symbol: upperSymbol,
          name: upperSymbol, // we can update the name later
          lastPrice: quote.c,
          prevClose: quote.pc,
          dayChangePercent: quote.dp || 0,
          lastFetchedAt: new Date(),
        },
      });
    }

    // Check if already in watchlist
    const existing = await prisma.watchlist.findUnique({
      where: {
        userId_stockId: {
          userId: req.userId,
          stockId: stock.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({ error: `${upperSymbol} is already in your watchlist` });
    }

    // Add to watchlist
    await prisma.watchlist.create({
      data: {
        userId: req.userId,
        stockId: stock.id,
      },
    });

    res.status(201).json({ message: `${upperSymbol} added to watchlist`, stock });
  } catch (error) {
    console.error("[Stocks] Watch error:", error.message);
    res.status(500).json({ error: "Failed to add stock" });
  }
});

// DELETE /api/stocks/watch/:symbol - remove from watchlist
router.delete("/watch/:symbol", async (req, res) => {
  try {
    const upperSymbol = req.params.symbol.toUpperCase().trim();

    const stock = await prisma.stock.findUnique({
      where: { symbol: upperSymbol },
    });

    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    await prisma.watchlist.deleteMany({
      where: {
        userId: req.userId,
        stockId: stock.id,
      },
    });

    res.json({ message: `${upperSymbol} removed from watchlist` });
  } catch (error) {
    console.error("[Stocks] Unwatch error:", error.message);
    res.status(500).json({ error: "Failed to remove stock" });
  }
});

// GET /api/stocks/:symbol/quote - get live quote
router.get("/:symbol/quote", async (req, res) => {
  try {
    const upperSymbol = req.params.symbol.toUpperCase().trim();
    const quote = await fetchQuote(upperSymbol);

    res.json({
      symbol: upperSymbol,
      price: quote.c,
      change: quote.d,
      changePercent: quote.dp,
      high: quote.h,
      low: quote.l,
      open: quote.o,
      prevClose: quote.pc,
    });
  } catch (error) {
    console.error("[Stocks] Quote error:", error.message);
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

module.exports = router;
