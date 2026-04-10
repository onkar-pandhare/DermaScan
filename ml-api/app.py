from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model
import numpy as np
from PIL import Image
import pickle
import cv2
import os

# 🔥 Flask setup (serve static images)
app = Flask(__name__, static_folder="static", static_url_path="/static")

# 📁 Create static folder if not exists
STATIC_FOLDER = "static"
os.makedirs(STATIC_FOLDER, exist_ok=True)

# 🧠 Load model
model = load_model("classifier_model.h5")

# 🔑 Load label encoder
with open("label_encoder.pkl", "rb") as f:
    le = pickle.load(f)

IMG_SIZE = 128  # IMPORTANT (match your model)

# 🚀 Prediction API
@app.route("/predict", methods=["POST"])
def predict():
    try:
        file = request.files["image"]

        # Save original image
        original_path = os.path.join(STATIC_FOLDER, "original.jpg")
        file.save(original_path)

        # 1️⃣ Original
        original = cv2.imread(original_path)

        # 2️⃣ Preprocessing (resize)
        resized = cv2.resize(original, (IMG_SIZE, IMG_SIZE))
        preprocessed_path = os.path.join(STATIC_FOLDER, "preprocessed.jpg")
        cv2.imwrite(preprocessed_path, resized)

        # 3️⃣ Segmentation (simple threshold mask)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 120, 255, cv2.THRESH_BINARY)
        mask_path = os.path.join(STATIC_FOLDER, "mask.jpg")
        cv2.imwrite(mask_path, mask)

        # 4️⃣ ROI extraction
        roi = cv2.bitwise_and(resized, resized, mask=mask)
        roi_path = os.path.join(STATIC_FOLDER, "roi.jpg")
        cv2.imwrite(roi_path, roi)

        # 5️⃣ Model prediction
        img = resized / 255.0
        img = np.expand_dims(img, axis=0)

        preds = model.predict(img)[0]
        class_index = np.argmax(preds)
        confidence = float(np.max(preds))

        label = le.inverse_transform([class_index])[0]

        # Label mapping
        label_map = {
            "akiec": "Actinic Keratoses",
            "bcc": "Basal Cell Carcinoma",
            "bkl": "Benign Keratosis",
            "df": "Dermatofibroma",
            "mel": "Melanoma",
            "nv": "Melanocytic Nevi",
            "vasc": "Vascular Lesion"
        }

        cancer_type = label_map[label]
        result = "Cancer" if label in ["mel", "bcc", "akiec"] else "Non-Cancer"

        # 🎯 Final response
        return jsonify({
            "result": result,
            "type": cancer_type,
            "confidence": round(confidence * 100, 2),

            # 🔥 Stage image paths
            "original": "static/original.jpg",
            "preprocessed": "static/preprocessed.jpg",
            "mask": "static/mask.jpg",
            "roi": "static/roi.jpg"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
   
   

print("Saving images to:", STATIC_FOLDER)
print(os.listdir(STATIC_FOLDER))



# ▶️ Run server
if __name__ == "__main__":
    app.run(port=8000)