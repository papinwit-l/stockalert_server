const express = require("express");
const prisma = require("../config/database");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

// GET /api/notifications - list user's notification history
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: {
          alert: { userId: req.userId },
        },
        include: {
          alert: {
            select: {
              condition: true,
              threshold: true,
              stock: { select: { symbol: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.notification.count({
        where: {
          alert: { userId: req.userId },
        },
      }),
    ]);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Notifications] List error:", error.message);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

module.exports = router;
