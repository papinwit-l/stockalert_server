const express = require("express");
const authMiddleware = require("../middleware/auth");
const {
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  getActiveAlertCount,
} = require("../controllers/alert.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAlerts);
router.post("/", createAlert);
router.patch("/:id", updateAlert);
router.delete("/:id", deleteAlert);
router.get("/count", getActiveAlertCount);

module.exports = router;
