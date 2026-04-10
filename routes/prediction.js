const express = require("express");
const router = express.Router();
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const Prediction = require("../models/prediction");

// 📦 Multer setup
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

// 🏠 Home route - PUBLIC (No login required)
router.get("/", (req, res) => {
    res.render("index");
});

// 🔍 Prediction route - PROTECTED (Login required)
router.post("/predict", upload.single("image"), async (req, res) => {
    try {
        // Check if user is logged in BEFORE processing
        if (!req.session.userId) {
            return res.redirect("/login?redirect=/");   // Redirect to login with return URL
        }

        console.log("✅ Request received");

        const formData = new FormData();
        formData.append("image", fs.createReadStream(req.file.path));

        const response = await axios.post(
            "http://localhost:8000/predict",
            formData,
            { headers: formData.getHeaders() }
        );

        const data = response.data;
        console.log("🔥 Flask response:", data);

        const imagePath = "uploads/" + req.file.filename;

        // Save to database
        await Prediction.create({
            imagePath: imagePath,
            result: data.result,
            cancerType: data.type,
            confidence: data.confidence,
            userId: req.session.userId
        });

        // Render result
        res.render("result", {
            result: data.result || "Non-Cancer",
            cancerType: data.type || "Unknown Type",
            confidence: data.confidence || 0,
            original: data.original ? "http://localhost:8000/" + data.original : "",
            preprocessed: data.preprocessed ? "http://localhost:8000/" + data.preprocessed : "",
            mask: data.mask ? "http://localhost:8000/" + data.mask : "",
            roi: data.roi ? "http://localhost:8000/" + data.roi : ""
        });

    } catch (err) {
        console.error("❌ Prediction ERROR:", err.message);
        res.status(500).send("Error during analysis. Please try again.");
    }
});

// 📊 History route - PROTECTED
router.get("/history", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login?redirect=/history");
    }

    Prediction.find({ userId: req.session.userId })
        .sort({ createdAt: -1 })
        .then(predictions => {
            res.render("history", { predictions: predictions || [] });
        })
        .catch(err => {
            console.error(err);
            res.render("history", { predictions: [] });
        });
});

module.exports = router;