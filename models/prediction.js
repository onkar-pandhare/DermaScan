const mongoose = require("mongoose");

const schema = new mongoose.Schema({
    imagePath: String,
    result: String,
    cancerType: String,
    confidence: Number,

    // 🔥 NEW FIELD
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Prediction", schema);