const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;

const app = express();

// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/skinDB3")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB Error:", err));

// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
    secret: "your-strong-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: "mongodb://127.0.0.1:27017/skinDB"
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Make user available globally in all EJS files
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});


// Uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
const authRoutes = require("./routes/auth");
const predictionRoutes = require("./routes/prediction");

app.use("/", authRoutes);
app.use("/", predictionRoutes);

// Server
app.listen(5000, () => {
    console.log("Server running at http://localhost:5000");
});