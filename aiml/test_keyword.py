# test_keyword.py
import requests
import librosa

# The URL of our new audio endpoint
url = 'http://127.0.0.1:5000/check_audio'

# IMPORTANT: Update this path to a real .wav file from your dataset
keyword_file_path = r'"D:\aegis-ai\aiml\speech_commands\go\0a2b400e_nohash_1.wav"'
unknown_word_path = r'"D:\aegis-ai\aiml\speech_commands\go\0a196374_nohash_1.wav"'

# --- Test 1: Send the keyword ---
print(f"--- Testing with keyword file: {keyword_file_path} ---")
# Load audio file and convert it to a list
y, sr = librosa.load(keyword_file_path, sr=16000)
audio_data = y.tolist()
response = requests.post(url, json={'data': audio_data})
print(f"Server Response: {response.json()}")

# --- Test 2: Send a different word ---
print(f"\n--- Testing with unknown word file: {unknown_word_path} ---")
y, sr = librosa.load(unknown_word_path, sr=16000)
audio_data = y.tolist()
response = requests.post(url, json={'data': audio_data})
print(f"Server Response: {response.json()}")