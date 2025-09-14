const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/auth');

// Since we don't have touristController yet, let's create simple route handlers for now

// All routes require authentication
router.use(authenticateToken);

// Update location endpoint
router.put('/location', authorize('tourist'), async (req, res) => {
  try {
    const { latitude, longitude, accuracy, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // For now, just return success - you can add database logic later
    console.log(`Location update for user ${req.user.id}:`, { latitude, longitude, address });

    res.json({
      message: 'Location updated successfully',
      location: { latitude, longitude, accuracy, address },
      user: req.user.name
    });

  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Get safety score endpoint
router.get('/safety-score', authorize('tourist'), async (req, res) => {
  try {
    // Return a default safety score for now
    const defaultScore = {
      current: 85,
      factors: {
        locationRisk: 3,
        timeOfDay: 5,
        weatherCondition: 7
      },
      last_updated: new Date().toISOString()
    };

    res.json({
      message: 'Safety score retrieved',
      score: defaultScore,
      user: req.user.name
    });

  } catch (error) {
    console.error('Get safety score error:', error);
    res.status(500).json({ error: 'Failed to get safety score' });
  }
});

// Create geofence endpoint
router.post('/geofences', authorize('tourist'), async (req, res) => {
  try {
    const { name, latitude, longitude, radius, type } = req.body;

    if (!name || !latitude || !longitude || !radius || !type) {
      return res.status(400).json({ 
        error: 'Name, coordinates, radius, and type are required' 
      });
    }

    if (!['safe', 'warning', 'danger'].includes(type)) {
      return res.status(400).json({ 
        error: 'Type must be safe, warning, or danger' 
      });
    }

    // For now, just return the created geofence
    const newGeofence = {
      id: `geofence_${Date.now()}`,
      name,
      coordinates: { latitude, longitude },
      radius: parseInt(radius),
      type,
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: req.user.name
    };

    console.log('Geofence created:', newGeofence);

    res.status(201).json({
      message: 'Geofence created successfully',
      geofence: newGeofence
    });

  } catch (error) {
    console.error('Create geofence error:', error);
    res.status(500).json({ error: 'Failed to create geofence' });
  }
});

module.exports = router;
