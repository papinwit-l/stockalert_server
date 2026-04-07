require("dotenv").config();

const express = require("express");
const cors = require("cors");
const prisma = require("./config/database");
const { startScheduler } = require("./services/scheduler.service");

// Routes
const authRoutes = require("./routes/auth.routes");
const stockRoutes = require("./routes/stock.routes");
const alertRoutes = require("./routes/alert.routes");
const notificationRoutes = require("./routes/notification.routes");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Start server
async function main() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("[Database] Connected to MySQL");

    // Start Express server
    app.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // Start the polling scheduler
    startScheduler();
  } catch (error) {
    console.error("[Server] Failed to start:", error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Server] Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Server] Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

main();
