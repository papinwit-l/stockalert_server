const prisma = require("../config/database");

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const API_KEY = process.env.FINNHUB_API_KEY;

/**
 * Fetch quote data for a single symbol from Finnhub
 * Returns: { c: current, d: change, dp: percent change, h: high, l: low, o: open, pc: previous close, t: timestamp }
 */
async function fetchQuote(symbol) {
  const url = `${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Finnhub API error for ${symbol}: ${response.status}`);
  }

  const data = await response.json();

  // Finnhub returns { c: 0, d: null, dp: null } for invalid symbols
  if (!data.c || data.c === 0) {
    throw new Error(`No data returned for symbol: ${symbol}`);
  }

  return data;
}

/**
 * Fetch and update prices for all watched stocks
 * Batches requests to respect Finnhub rate limits (60/min on free tier)
 */
async function fetchAllPrices() {
  // Get all unique stocks that are being watched
  const stocks = await prisma.stock.findMany({
    where: {
      watchlist: { some: {} }, // only fetch stocks someone is watching
    },
  });

  if (stocks.length === 0) {
    console.log("[Finnhub] No stocks in any watchlist, skipping fetch");
    return [];
  }

  console.log(`[Finnhub] Fetching prices for ${stocks.length} stocks...`);

  const results = [];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const stock of stocks) {
    try {
      const quote = await fetchQuote(stock.symbol);

      // Update stock record with latest data
      const updated = await prisma.stock.update({
        where: { id: stock.id },
        data: {
          lastPrice: quote.c,
          prevClose: quote.pc,
          dayChangePercent: quote.dp || 0,
          volume: quote.v || stock.volume,
          lastFetchedAt: new Date(),
        },
      });

      results.push(updated);
      console.log(
        `  ${stock.symbol}: $${quote.c} (${quote.dp > 0 ? "+" : ""}${quote.dp}%)`
      );

      // Rate limit: ~1 request per second to stay safe under 60/min
      await delay(1100);
    } catch (error) {
      console.error(`  [Error] ${stock.symbol}: ${error.message}`);
    }
  }

  console.log(`[Finnhub] Updated ${results.length}/${stocks.length} stocks`);
  return results;
}

module.exports = { fetchQuote, fetchAllPrices };
