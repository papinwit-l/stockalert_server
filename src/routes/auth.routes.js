const express = require("express");
const { register, login, changePassword, forgotPassword, resetPassword } = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.patch("/change-password", authMiddleware, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
