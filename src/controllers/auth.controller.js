const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/database");
const { sendNotification } = require("../services/ntfy.service");

const register = async (req, res) => {
  try {
    const { name, email, password, ntfyTopic } = req.body;

    if (!name || !email || !password || !ntfyTopic) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, ntfyTopic },
      select: { id: true, name: true, email: true, ntfyTopic: true, createdAt: true },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({ user, token });
  } catch (error) {
    console.error("[Auth] Register error:", error.message);
    res.status(500).json({ error: "Failed to register" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      user: { id: user.id, name: user.name, email: user.email, ntfyTopic: user.ntfyTopic },
      token,
    });
  } catch (error) {
    console.error("[Auth] Login error:", error.message);
    res.status(500).json({ error: "Failed to login" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("[Auth] Change password error:", error.message);
    res.status(500).json({ error: "Failed to change password" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond the same way to avoid user enumeration
    if (!user) {
      return res.json({ message: "If that email exists, a reset token has been sent via ntfy" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hashedToken, resetTokenExpiresAt: expiresAt },
    });

    await sendNotification(
      user.ntfyTopic,
      "Password Reset Request",
      `Your reset token (valid 15 min):\n${token}`,
      "high",
      ["key"]
    );

    res.json({ message: "If that email exists, a reset token has been sent via ntfy" });
  } catch (error) {
    console.error("[Auth] Forgot password error:", error.message);
    res.status(500).json({ error: "Failed to process request" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "token and newPassword are required" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpiresAt: null },
    });

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("[Auth] Reset password error:", error.message);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

module.exports = { register, login, changePassword, forgotPassword, resetPassword };
