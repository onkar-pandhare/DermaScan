const mongoose = require("mongoose");

const predictionSchema = new mongoose.Schema({
    imagePath: {
        type: String,
        required: true,  // Cloudinary HTTPS URL
    },
    result:     String,
    cancerType: String,
    confidence: Number,
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Prediction", predictionSchema);