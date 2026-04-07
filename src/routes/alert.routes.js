const express = require("express");
const authMiddleware = require("../middleware/auth");
const { getAlerts, createAlert, updateAlert, deleteAlert } = require("../controllers/alert.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAlerts);
router.post("/", createAlert);
router.patch("/:id", updateAlert);
router.delete("/:id", deleteAlert);

module.exports = router;
