const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/database");

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

module.exports = { register, login };
