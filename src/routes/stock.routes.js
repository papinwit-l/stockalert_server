const express = require("express");
const authMiddleware = require("../middleware/auth");
const { getWatchlist, watchStock, unwatchStock, getQuote } = require("../controllers/stock.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getWatchlist);
router.post("/watch", watchStock);
router.delete("/watch/:symbol", unwatchStock);
router.get("/:symbol/quote", getQuote);

module.exports = router;
