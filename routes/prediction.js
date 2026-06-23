const express = require("express");
const router = express.Router();
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const Prediction = require("../models/prediction");
const cloudinary = require("../utils/cloudinary");

// 📦 Multer — memory storage (no local uploads/ folder needed)
const upload = multer({ storage: multer.memoryStorage() });

// Helper: stream a Buffer to Cloudinary and return the secure URL
async function uploadToCloudinary(buffer, filename) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "dermascan",
                public_id: filename,
                resource_type: "image",
                overwrite: true,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        );
        stream.end(buffer);
    });
}

// 🏠 Home — PUBLIC
router.get("/", (req, res) => {
    res.render("index");
});

// 🔍 Predict — PROTECTED
router.post("/predict", upload.single("image"), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect("/login?redirect=/");
        }

        if (!req.file) {
            return res.status(400).send("No image uploaded.");
        }

        console.log("✅ Request received");

        // 1. Forward image buffer to Flask
        const formData = new FormData();
        formData.append("image", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        const flaskUrl = process.env.FLASK_URL || "http://localhost:8000";
        const response = await axios.post(
            `${flaskUrl}/predict`,
            formData,
            { headers: formData.getHeaders() }
        );

        const data = response.data;
        console.log("🔥 Flask response:", data);

        // 2. Upload image to Cloudinary
        const uniqueName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, "_")}`;
        const cloudinaryUrl = await uploadToCloudinary(req.file.buffer, uniqueName);
        console.log("☁️  Cloudinary URL:", cloudinaryUrl);

        // 3. Save prediction to MongoDB Atlas
        await Prediction.create({
            imagePath: cloudinaryUrl,
            result: data.result,
            cancerType: data.type,
            confidence: data.confidence,
            userId: req.session.userId,
        });

        // 4. Render result page
        res.render("result", {
            result:       data.result        || "Non-Cancer",
            cancerType:   data.type          || "Unknown Type",
            confidence:   data.confidence    || 0,
            original:     data.original      ? `${flaskUrl}/${data.original}`      : cloudinaryUrl,
            preprocessed: data.preprocessed  ? `${flaskUrl}/${data.preprocessed}` : "",
            mask:         data.mask          ? `${flaskUrl}/${data.mask}`          : "",
            roi:          data.roi           ? `${flaskUrl}/${data.roi}`           : "",
        });

    } catch (err) {
        console.error("❌ Prediction ERROR:", err.message);
        res.status(500).send("Error during analysis. Please try again.");
    }
});

// 📊 History — PROTECTED
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