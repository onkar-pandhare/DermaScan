"""
DermaScan — Flask ML API  (app.py)
===================================
Updated for the new model: EfficientNetV2S + Transformer
  • Input  : 256 × 256 × 4  (RGB image + grayscale mask channel)
  • Output : softmax over the same class list used during training
  • Accuracy: 89.14 % (TTA) on validation set

Key differences from the old model
  OLD → input 128×128×3, simple Keras .h5, label_encoder.pkl
  NEW → input 256×256×4, best_skin_disease_model.keras, no pkl needed
        (classes are hard-coded in the same sorted order as training)
"""
import os
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import os
import io
import cv2
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename

# ── App setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
STATIC_FOLDER = "static"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(STATIC_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# ── Model configuration ────────────────────────────────────────────────────────
# Must match IMG_SIZE used during training (notebook cell [1])
IMG_SIZE = 256

# Classes MUST be in the same sorted order as training (notebook cell [2])
# df['dx'].unique() → sorted() → this list
CLASSES = sorted([
    "abrasion",
    "akiec",      # Actinic Keratosis / Intraepithelial Carcinoma
    "bcc",        # Basal Cell Carcinoma
    "bkl",        # Benign Keratosis-like Lesion
    "bruise",
    "burn",
    "cut",
    "df",         # Dermatofibroma
    "mel",        # Melanoma
    "nv",         # Melanocytic Nevi
    "vasc",       # Vascular Lesion
])

# ⚠️  Update this path to wherever you store the .keras file
MODEL_PATH = os.environ.get("MODEL_PATH", "best_skin_disease_model.keras")

# Classes the model flags as cancerous/malignant
MALIGNANT_CLASSES = {"mel", "bcc", "akiec"}

# Human-readable labels for the frontend
CLASS_LABELS = {
    "abrasion": "Abrasion",
    "akiec":    "Actinic Keratosis / Carcinoma",
    "bcc":      "Basal Cell Carcinoma",
    "bkl":      "Benign Keratosis",
    "bruise":   "Bruise",
    "burn":     "Burn",
    "cut":      "Cut",
    "df":       "Dermatofibroma",
    "mel":      "Melanoma",
    "nv":       "Melanocytic Nevi",
    "vasc":     "Vascular Lesion",
}

# ── Load model once at startup ─────────────────────────────────────────────────
print(f"[DermaScan] Loading model from: {MODEL_PATH}")
model = tf.keras.models.load_model(MODEL_PATH)
print(f"[DermaScan] Model loaded. Input shape: {model.input_shape}")


# ── Image preprocessing ────────────────────────────────────────────────────────
def preprocess_image(img_bgr):
    """
    Replicates the exact pipeline from the notebook's BalancedHybridGenerator.

    The new model expects a 4-channel input:
        channels 0-2 → RGB image, normalised to [0, 1]
        channel  3   → grayscale segmentation mask, normalised to [0, 1]

    Since we don't have a pre-computed mask at inference time, we generate
    one automatically using Otsu thresholding on the grayscale image.
    This closely matches what the training mask pipeline produces.
    """
    # ── 1. Resize to training size
    img_resized = cv2.resize(img_bgr, (IMG_SIZE, IMG_SIZE))

    # ── 2. Auto-generate segmentation mask (Otsu threshold on grayscale)
    gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # ── 3. Normalise both to [0, 1]
    img_norm  = img_resized / 255.0
    mask_norm = mask        / 255.0

    # ── 4. Concatenate → (256, 256, 4)
    img_4ch = np.concatenate(
        [img_norm, np.expand_dims(mask_norm, axis=-1)],
        axis=-1
    )

    return img_4ch.astype(np.float32), mask


def save_stage_images(img_bgr, mask):
    """Save the 4 pipeline stage images to Flask's /static folder."""
    resized = cv2.resize(img_bgr, (IMG_SIZE, IMG_SIZE))

    # Preprocessed: normalise then scale back for saving
    preprocessed_vis = (resized / 255.0 * 255).astype(np.uint8)

    # ROI: apply mask
    mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    roi = cv2.bitwise_and(resized, mask_3ch)

    cv2.imwrite(os.path.join(STATIC_FOLDER, "original.jpg"),     resized)
    cv2.imwrite(os.path.join(STATIC_FOLDER, "preprocessed.jpg"), preprocessed_vis)
    cv2.imwrite(os.path.join(STATIC_FOLDER, "mask.jpg"),         mask)
    cv2.imwrite(os.path.join(STATIC_FOLDER, "roi.jpg"),          roi)


# ── Test-Time Augmentation (TTA) — same as notebook cell [9] ──────────────────
def predict_with_tta(img_bgr, tta_steps=5):
    """
    Averages predictions across multiple augmented versions of the same image.
    Mirrors the TTA used to achieve the 89.14 % reported accuracy.
    """
    preds = []

    for step in range(tta_steps):
        aug = img_bgr.copy()

        if step > 0:
            # Horizontal flip
            if step % 2 == 0:
                aug = cv2.flip(aug, 1)
            # Small random rotation
            angle = np.random.choice([-15, -10, 0, 10, 15])
            if angle != 0:
                M   = cv2.getRotationMatrix2D(
                    (IMG_SIZE // 2, IMG_SIZE // 2), angle, 1.0
                )
                aug = cv2.warpAffine(aug, M, (IMG_SIZE, IMG_SIZE))

        img_4ch, _ = preprocess_image(aug)
        batch       = np.expand_dims(img_4ch, axis=0)   # (1, 256, 256, 4)
        pred        = model.predict(batch, verbose=0)[0] # (num_classes,)
        preds.append(pred)

    return np.mean(preds, axis=0)   # averaged probabilities


# ── Predict endpoint ───────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    try:
        # Read image from upload directly (no disk write needed for prediction)
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img_bgr    = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img_bgr is None:
            return jsonify({"error": "Could not decode image"}), 400

        # ── Run preprocessing and save stage images
        _, mask = preprocess_image(img_bgr)
        save_stage_images(img_bgr, mask)

        # ── Run TTA prediction
        probs       = predict_with_tta(img_bgr, tta_steps=5)
        class_idx   = int(np.argmax(probs))
        class_key   = CLASSES[class_idx]
        confidence  = float(probs[class_idx]) * 100

        # ── Determine cancer vs non-cancer
        is_cancer   = class_key in MALIGNANT_CLASSES
        result      = "Cancer" if is_cancer else "Non-Cancer"
        cancer_type = CLASS_LABELS.get(class_key, class_key)

        return jsonify({
            # Core result (same keys Express expects)
            "result":       result,
            "type":         cancer_type,
            "confidence":   round(confidence, 2),

            # Stage image paths (served by Flask /static/)
            "original":     "static/original.jpg",
            "preprocessed": "static/preprocessed.jpg",
            "mask":         "static/mask.jpg",
            "roi":          "static/roi.jpg",

            # Extra info (optional — useful for frontend enhancements)
            "class_key":    class_key,
            "is_malignant": is_cancer,
        })

    except Exception as e:
        print(f"[DermaScan] Prediction error: {e}")
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


# ── Health check ───────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":      "ok",
        "model":       MODEL_PATH,
        "img_size":    IMG_SIZE,
        "num_classes": len(CLASSES),
        "classes":     CLASSES,
    })


# ── Run ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
