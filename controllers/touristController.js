const { supabase } = require('../utils/supabase');
const Joi = require('joi');

const updateLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracy: Joi.number().optional(),
  address: Joi.string().optional(),
  timestamp: Joi.date().optional()
});

exports.updateLocation = async (req, res) => {
  try {
    const { error, value } = updateLocationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { latitude, longitude, accuracy, address } = value;

    // Get current tourist profile
    const { data: profile, error: fetchError } = await supabase
      .from('tourist_profiles')
      .select('location_history')
      .eq('user_id', req.user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // Not found is ok for first time
      return res.status(500).json({ error: fetchError.message });
    }

    // Prepare location entry
    const locationEntry = {
      latitude,
      longitude,
      accuracy,
      address,
      timestamp: new Date().toISOString(),
      source: 'mobile_app'
    };

    // Update or create tourist profile
    const currentHistory = profile?.location_history || [];
    const updatedHistory = [...currentHistory.slice(-49), locationEntry]; // Keep last 50 locations

    const { data: updatedProfile, error: updateError } = await supabase
      .from('tourist_profiles')
      .upsert({
        user_id: req.user.id,
        location_history: updatedHistory,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Check for geofence violations (simplified logic)
    await checkGeofenceViolations(req.user.id, latitude, longitude);

    res.json({
      message: 'Location updated successfully',
      profile: updatedProfile
    });

  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
};

exports.getSafetyScore = async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('tourist_profiles')
      .select('safety_score')
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Tourist profile not found' });
    }

    res.json({
      score: profile.safety_score || { current: 100, factors: {}, last_updated: null }
    });

  } catch (error) {
    console.error('Get safety score error:', error);
    res.status(500).json({ error: 'Failed to get safety score' });
  }
};

exports.createGeofence = async (req, res) => {
  try {
    const { name, latitude, longitude, radius, type } = req.body;

    // Validation
    if (!name || !latitude || !longitude || !radius || !type) {
      return res.status(400).json({ error: 'Name, coordinates, radius, and type are required' });
    }

    if (!['safe', 'warning', 'danger'].includes(type)) {
      return res.status(400).json({ error: 'Type must be safe, warning, or danger' });
    }

    // Get current tourist profile
    const { data: profile, error: fetchError } = await supabase
      .from('tourist_profiles')
      .select('geofences')
      .eq('user_id', req.user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: fetchError.message });
    }

    // Create new geofence
    const newGeofence = {
      id: `geofence_${Date.now()}`,
      name,
      coordinates: { latitude, longitude },
      radius: parseInt(radius),
      type,
      is_active: true,
      created_at: new Date().toISOString()
    };

    const currentGeofences = profile?.geofences || [];
    const updatedGeofences = [...currentGeofences, newGeofence];

    // Update profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('tourist_profiles')
      .upsert({
        user_id: req.user.id,
        geofences: updatedGeofences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.status(201).json({
      message: 'Geofence created successfully',
      geofence: newGeofence
    });

  } catch (error) {
    console.error('Create geofence error:', error);
    res.status(500).json({ error: 'Failed to create geofence' });
  }
};

// Helper function to check geofence violations
async function checkGeofenceViolations(userId, latitude, longitude) {
  try {
    // Get user's geofences
    const { data: profile } = await supabase
      .from('tourist_profiles')
      .select('geofences')
      .eq('user_id', userId)
      .single();

    if (!profile || !profile.geofences) return;

    // Check each geofence
    for (const geofence of profile.geofences) {
      if (!geofence.is_active) continue;

      const distance = calculateDistance(
        latitude, longitude,
        geofence.coordinates.latitude, geofence.coordinates.longitude
      );

      // If within danger zone, create alert
      if (distance <= geofence.radius && geofence.type === 'danger') {
        await supabase
          .from('alerts')
          .insert({
            tourist_id: userId,
            type: 'geofence_violation',
            severity: 'high',
            location: JSON.stringify({
              latitude,
              longitude,
              address: `Near ${geofence.name}`
            }),
            message: `Tourist entered danger zone: ${geofence.name}`,
            auto_generated: true
          });
      }
    }

  } catch (error) {
    console.error('Geofence check error:', error);
  }
}

// Simple distance calculation (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

module.exports = {
  updateLocation: exports.updateLocation,
  getSafetyScore: exports.getSafetyScore,
  createGeofence: exports.createGeofence
};

