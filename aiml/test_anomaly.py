# test_anomaly.py - UPDATED VERSION

import requests
import numpy as np

# The URL for the activity classifier endpoint
url = 'http://127.0.0.1:5000/check_activity'

# --- Test 1: Simulate a "walking" sequence ---
# We'll create a fake sequence of 100 timestamps for walking.
# This creates a NumPy array of shape (100, 6) with some noise.
print("--- Testing with NORMAL (walking) data ---")
walking_sequence = np.random.rand(100, 6) 
# The server expects the data inside a 'data' key, and it must be a list
payload_normal = {'data': walking_sequence.tolist()}
# Send the POST request
response_normal = requests.post(url, json=payload_normal)
print(f"Server Response: {response_normal.json()}")


# --- Test 2: Simulate a "falling" sequence ---
# We'll create a mostly normal sequence with a huge spike at the end.
print("\n--- Testing with ABNORMAL (fall) data ---")
falling_sequence = np.random.rand(100, 6)
falling_sequence[-1, :] = 20.0 # Add a large spike to the last timestamp
# Format the payload
payload_abnormal = {'data': falling_sequence.tolist()}
# Send the POST request
response_abnormal = requests.post(url, json=payload_abnormal)
print(f"Server Response: {response_abnormal.json()}")