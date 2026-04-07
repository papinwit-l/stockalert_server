const express = require("express");
const authMiddleware = require("../middleware/auth");
const { getNotifications } = require("../controllers/notification.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getNotifications);

module.exports = router;
