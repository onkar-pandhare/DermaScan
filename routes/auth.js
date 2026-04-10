const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcrypt");

// 🔹 Signup page
router.get("/signup", (req, res) => {
    res.render("signup");
});

// 🔹 Signup logic
router.post("/signup", async (req, res) => {
    const { username, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
        username,
        email,
        password: hashedPassword
    });

    await user.save();

    res.redirect("/login");
});

// 🔹 Login page
router.get("/login", (req, res) => {
    res.render("login");
});

// 🔹 Login logic
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) return res.send("User not found");

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) return res.send("Invalid password");

    req.session.userId = user._id;

    res.redirect("/");
});

// 🔹 Logout
router.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});

module.exports = router;