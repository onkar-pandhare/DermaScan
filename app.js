require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const passport = require("passport");

const app = express();

// MongoDB (use Atlas in production)
mongoose.connect(process.env.MONGO_URI )
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || "dermascan-secret-key-2026",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24, httpOnly: true }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Global user
app.use((req, res, next) => {
    res.locals.user = req.user || req.session.user || null;
    next();
});

// Uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
const authRoutes = require("./routes/auth");
const predictionRoutes = require("./routes/prediction");

app.use("/", authRoutes);
app.use("/", predictionRoutes);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ DermaScan running on port ${PORT}`);
});