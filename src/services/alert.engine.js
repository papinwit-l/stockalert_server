const prisma = require("../config/database");
const { sendStockAlert } = require("./ntfy.service");

/**
 * Check if a condition is met for the given stock and alert
 */
function isConditionMet(stock, alert) {
  switch (alert.condition) {
    case "PRICE_ABOVE":
      return stock.lastPrice >= alert.threshold;

    case "PRICE_BELOW":
      return stock.lastPrice <= alert.threshold;

    case "PERCENT_UP":
      return stock.dayChangePercent >= alert.threshold;

    case "PERCENT_DOWN":
      // threshold is positive (e.g., 5 means -5%)
      return stock.dayChangePercent <= -alert.threshold;

    case "VOLUME_SPIKE":
      // threshold is multiplier (e.g., 2.0 = volume is 2x average)
      if (stock.avgVolume === 0) return false;
      return stock.volume >= stock.avgVolume * alert.threshold;

    default:
      console.warn(`[Alert Engine] Unknown condition: ${alert.condition}`);
      return false;
  }
}

/**
 * Check if the price has moved away from threshold by buffer %
 * Used to re-arm alerts in REPEAT mode
 */
function shouldRearm(stock, alert) {
  const bufferFraction = alert.buffer / 100;

  switch (alert.condition) {
    case "PRICE_ABOVE":
      // Re-arm when price drops below threshold * (1 - buffer%)
      return stock.lastPrice < alert.threshold * (1 - bufferFraction);

    case "PRICE_BELOW":
      // Re-arm when price rises above threshold * (1 + buffer%)
      return stock.lastPrice > alert.threshold * (1 + bufferFraction);

    case "PERCENT_UP":
      // Re-arm when daily change drops below threshold - buffer
      return stock.dayChangePercent < alert.threshold - alert.buffer;

    case "PERCENT_DOWN":
      // Re-arm when daily change rises above -(threshold - buffer)
      return stock.dayChangePercent > -(alert.threshold - alert.buffer);

    case "VOLUME_SPIKE":
      // Re-arm when volume drops below threshold * (1 - buffer%) * avgVolume
      if (stock.avgVolume === 0) return false;
      return (
        stock.volume < stock.avgVolume * alert.threshold * (1 - bufferFraction)
      );

    default:
      return false;
  }
}

/**
 * Check if cooldown period has passed
 */
function isCooldownExpired(alert) {
  if (!alert.cooldown || !alert.lastTriggeredAt) return true;

  const cooldownMs = alert.cooldown * 60 * 1000; // cooldown is in minutes
  const elapsed = Date.now() - new Date(alert.lastTriggeredAt).getTime();

  return elapsed >= cooldownMs;
}

/**
 * Build a human-readable notification message
 */
function buildNotificationMessage(stock, alert) {
  const conditionLabels = {
    PRICE_ABOVE: "crossed above",
    PRICE_BELOW: "dropped below",
    PERCENT_UP: "up",
    PERCENT_DOWN: "down",
    VOLUME_SPIKE: "volume spike",
  };

  const label = conditionLabels[alert.condition] || alert.condition;
  const changeSign = stock.dayChangePercent >= 0 ? "+" : "";

  switch (alert.condition) {
    case "PRICE_ABOVE":
    case "PRICE_BELOW":
      return `${stock.symbol} ${label} $${alert.threshold.toFixed(2)} at $${stock.lastPrice.toFixed(2)} (${changeSign}${stock.dayChangePercent.toFixed(2)}% today)`;

    case "PERCENT_UP":
    case "PERCENT_DOWN":
      return `${stock.symbol} ${label} ${Math.abs(stock.dayChangePercent).toFixed(2)}% today at $${stock.lastPrice.toFixed(2)}`;

    case "VOLUME_SPIKE":
      const multiplier =
        stock.avgVolume > 0 ? (stock.volume / stock.avgVolume).toFixed(1) : "?";
      return `${stock.symbol} ${label} (${multiplier}x avg volume) at $${stock.lastPrice.toFixed(2)}`;

    default:
      return `${stock.symbol} alert triggered at $${stock.lastPrice.toFixed(2)}`;
  }
}

/**
 * Main alert engine - runs every polling cycle
 * 1. Get all active alerts with their stock data
 * 2. Check disarmed alerts for re-arming
 * 3. Check armed alerts for condition match
 * 4. Deactivate/disarm FIRST, then send notification (prevent double-fire)
 */
async function runAlertEngine() {
  console.log("\n[Alert Engine] Running check...");

  // Get all active alerts with stock and user data
  const alerts = await prisma.alert.findMany({
    where: { isActive: true },
    include: {
      stock: true,
      user: true,
    },
  });

  if (alerts.length === 0) {
    console.log("[Alert Engine] No active alerts");
    return;
  }

  let fired = 0;
  let rearmed = 0;

  for (const alert of alerts) {
    const stock = alert.stock;

    // Skip if stock hasn't been fetched yet
    if (!stock.lastFetchedAt) continue;

    // --- STEP 1: Try to re-arm disarmed alerts ---
    if (!alert.isArmed) {
      if (shouldRearm(stock, alert)) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: { isArmed: true },
        });
        rearmed++;
        console.log(
          `  [Re-armed] ${stock.symbol} - ${alert.condition} @ ${alert.threshold}`,
        );
      }
      continue; // don't check condition on the same cycle as re-arming
    }

    // --- STEP 2: Check cooldown ---
    if (!isCooldownExpired(alert)) continue;

    // --- STEP 3: Check condition ---
    if (!isConditionMet(stock, alert)) continue;

    // --- STEP 4: Condition met! ---
    console.log(
      `  [TRIGGERED] ${stock.symbol} - ${alert.condition} @ ${alert.threshold} (price: $${stock.lastPrice})`,
    );

    // Deactivate/disarm IMMEDIATELY (before sending ntfy)
    // This prevents double-fire if overlapping poll cycles occur
    const updateData = {
      lastTriggeredAt: new Date(),
    };

    if (alert.notifyMode === "ONCE") {
      updateData.isActive = false;
    } else {
      updateData.isArmed = false;
    }

    await prisma.alert.update({
      where: { id: alert.id },
      data: updateData,
    });

    // THEN send ntfy notification (safe now — alert is already deactivated)
    const sent = await sendStockAlert(alert.user.ntfyTopic, stock, alert);

    // Save notification history with readable message
    const message = buildNotificationMessage(stock, alert);

    await prisma.notification.create({
      data: {
        alertId: alert.id,
        message,
        priceAtTrigger: stock.lastPrice,
        sent,
      },
    });

    fired++;
  }

  console.log(
    `[Alert Engine] Done. Checked: ${alerts.length} | Fired: ${fired} | Re-armed: ${rearmed}`,
  );
}

module.exports = { runAlertEngine, isConditionMet, shouldRearm };
