# app.py - FINAL COMPLETE AI SERVER

from flask import Flask, request, jsonify
import joblib
import numpy as np
import pandas as pd
from tensorflow.keras.models import load_model
import librosa

# 1. Create Flask App
app = Flask(__name__)

# 2. Load all models and encoders
print("Loading all models...")
risk_model = joblib.load('risk_model.joblib')
activity_model = load_model('activity_classifier_model.h5')
keyword_model = load_model('keyword_model.h5')
label_encoder = joblib.load('label_encoder.joblib')
print("All models loaded successfully.")

# Endpoint 1: Predictive Risk Map (No changes)
@app.route('/predict', methods=['GET'])
def predict():
    # ... (code is the same as before)
    try:
        lat = float(request.args.get('lat'))
        lon = float(request.args.get('lon'))
        year = int(request.args.get('year'))
    except (TypeError, ValueError): return jsonify({'error': 'Invalid parameters.'}), 400
    input_data = pd.DataFrame({'latitude': [lat], 'longitude': [lon], 'Year': [year]})
    prediction = risk_model.predict(input_data)
    return jsonify({'predicted_risk_score': round(prediction[0], 2)})

# Endpoint 2: Advanced Activity Classifier (No changes)
@app.route('/check_activity', methods=['POST'])
def check_activity():
    # ... (code is the same as before)
    try:
        sequence_data = request.get_json()['data']
        input_data = np.array(sequence_data).reshape(1, 100, 6)
    except Exception as e: return jsonify({'error': f'Invalid input data. {e}'}), 400
    prediction_probs = activity_model.predict(input_data)
    predicted_index = np.argmax(prediction_probs, axis=1)[0]
    predicted_activity = label_encoder.inverse_transform([predicted_index])[0]
    return jsonify({'predicted_activity': predicted_activity})

# ===================================================================
# ENDPOINT 3: KEYWORD SPOTTING (NEW)
# ===================================================================
@app.route('/check_audio', methods=['POST'])
def check_audio():
    try:
        # The mobile app will send the raw audio data
        audio_data = np.array(request.get_json()['data'])
        
        # Process the audio into a spectrogram, just like in training
        spectrogram = librosa.feature.melspectrogram(y=audio_data, sr=16000, n_mels=128)
        spectrogram_db = librosa.power_to_db(spectrogram, ref=np.max)
        
        # Reshape for the CNN model
        input_spectrogram = spectrogram_db.reshape(1, spectrogram_db.shape[0], spectrogram_db.shape[1], 1)

    except Exception as e:
        return jsonify({'error': f'Invalid audio data processing. {e}'}), 400

    # Make prediction
    prediction_probs = keyword_model.predict(input_spectrogram)[0]
    predicted_index = np.argmax(prediction_probs)
    
    # We defined 'go' as our keyword, which has the label '2'
    is_keyword_detected = (predicted_index == 2)
    confidence = float(prediction_probs[predicted_index])

    return jsonify({
        'keyword_detected': is_keyword_detected,
        'confidence': round(confidence, 3)
    })

# Run the server
if __name__ == '__main__':
    app.run(debug=True, port=5000)