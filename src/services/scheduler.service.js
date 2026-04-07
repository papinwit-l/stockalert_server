const cron = require("node-cron");
const { fetchAllPrices } = require("./finnhub.service");
const { runAlertEngine } = require("./alert.engine");
const prisma = require("../config/database");

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 5;

/**
 * Check if US stock market is currently open
 * Market hours: Mon-Fri, 9:30 AM - 4:00 PM Eastern Time
 */
function isMarketOpen() {
  const now = new Date();

  // Convert to Eastern Time
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );

  const day = et.getDay(); // 0=Sun, 6=Sat
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const openTime =
    (parseInt(process.env.MARKET_OPEN_HOUR) || 9) * 60 +
    (parseInt(process.env.MARKET_OPEN_MINUTE) || 30);
  const closeTime =
    (parseInt(process.env.MARKET_CLOSE_HOUR) || 16) * 60 +
    (parseInt(process.env.MARKET_CLOSE_MINUTE) || 0);

  // Weekdays only, within market hours
  const isWeekday = day >= 1 && day <= 5;
  const isDuringHours = timeInMinutes >= openTime && timeInMinutes < closeTime;

  return isWeekday && isDuringHours;
}

/**
 * Main polling cycle: fetch prices → run alert engine
 */
async function pollCycle() {
  if (!isMarketOpen()) {
    console.log(`[Scheduler] Market closed, skipping poll`);
    return;
  }

  try {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`[Scheduler] Poll cycle started at ${new Date().toISOString()}`);

    // Step 1: Fetch latest prices
    await fetchAllPrices();

    // Step 2: Run alert engine
    await runAlertEngine();

    console.log(`[Scheduler] Poll cycle complete`);
    console.log(`${"=".repeat(50)}`);
  } catch (error) {
    console.error(`[Scheduler] Poll cycle error: ${error.message}`);
  }
}

/**
 * Cleanup notifications older than 7 days
 */
async function cleanupOldNotifications() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { count } = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: sevenDaysAgo },
      },
    });

    if (count > 0) {
      console.log(`[Cleanup] Deleted ${count} notifications older than 7 days`);
    }
  } catch (error) {
    console.error(`[Cleanup] Error: ${error.message}`);
  }
}

/**
 * Start all scheduled jobs
 */
function startScheduler() {
  // Poll every X minutes
  const cronExpression = `*/${POLL_INTERVAL} * * * *`;
  cron.schedule(cronExpression, pollCycle);
  console.log(`[Scheduler] Polling every ${POLL_INTERVAL} minutes`);

  // Cleanup old notifications daily at midnight
  cron.schedule("0 0 * * *", cleanupOldNotifications);
  console.log("[Scheduler] Notification cleanup scheduled daily at midnight");

  // Run first poll immediately on startup
  console.log("[Scheduler] Running initial poll...");
  pollCycle();
}

module.exports = { startScheduler, pollCycle, isMarketOpen };
