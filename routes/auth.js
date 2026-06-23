const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcrypt");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:5000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ email: profile.emails[0].value });

        if (!user) {
            user = new User({
                username: profile.displayName || profile.emails[0].value.split("@")[0],
                email: profile.emails[0].value,
                googleId: profile.id,
            });
            await user.save();
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

// Signup
router.get("/signup", (req, res) => res.render("signup", { error: null }));

router.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.render("signup", { error: "All fields are required" });
        }

        const existing = await User.findOne({ email });
        if (existing) return res.render("signup", { error: "Email already exists" });

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashed });
        await user.save();

        req.session.userId = user._id;
        res.redirect("/");
    } catch (err) {
        res.render("signup", { error: "Something went wrong" });
    }
});

// Login
router.get("/login", (req, res) => {
    const redirectUrl = req.query.redirect || "/";
    res.render("login", { error: null, redirect: redirectUrl });
});

router.post("/login", async (req, res) => {
    try {
        const { email, password, redirect } = req.body;
        const redirectUrl = redirect || "/";

        const user = await User.findOne({ email });
        if (!user) return res.render("login", { error: "User not found", redirect: redirectUrl });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.render("login", { error: "Invalid password", redirect: redirectUrl });

        req.session.userId = user._id;
        res.redirect(redirectUrl);
    } catch (err) {
        res.render("login", { error: "Login failed", redirect: req.body.redirect || "/" });
    }
});

// Google Login Routes
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => {
        req.session.userId = req.user._id;
        res.redirect("/");
    }
);

// Logout
router.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;