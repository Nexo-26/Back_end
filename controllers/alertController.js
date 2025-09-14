const { supabase } = require('../utils/supabase');
const Joi = require('joi');

// Validation schema for creating alerts
const createAlertSchema = Joi.object({
  type: Joi.string().valid('panic', 'geofence_violation', 'low_safety_score', 'missing', 'health_emergency', 'suspicious_activity').required(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  location: Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
    address: Joi.string().optional(),
    accuracy: Joi.number().optional()
  }).required(),
  message: Joi.string().max(500).optional(),
  additional_data: Joi.object().optional()
});

exports.createAlert = async (req, res) => {
  try {
    // Validate input
    const { error, value } = createAlertSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Create alert in database
    const { data: alert, error: insertError } = await supabase
      .from('alerts')
      .insert({
        tourist_id: req.user.id,
        type: value.type,
        severity: value.severity || 'medium',
        location: JSON.stringify(value.location),
        message: value.message,
        additional_data: JSON.stringify(value.additional_data || {}),
        status: 'active'
      })
      .select(`
        *,
        user_profiles:tourist_id (name, phone)
      `)
      .single();

    if (insertError) {
      console.error('Alert creation error:', insertError);
      return res.status(500).json({ error: 'Failed to create alert' });
    }

    // Send real-time notification to dashboard
    await notifyAuthorities(alert);

    res.status(201).json({
      message: 'Alert created successfully',
      alert
    });

  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
};

exports.getAlerts = async (req, res) => {
  try {
    const { status, type, severity, page = 1, limit = 20 } = req.query;
    
    let query = supabase
      .from('alerts')
      .select(`
        *,
        user_profiles:tourist_id (name, phone, role)
      `)
      .order('created_at', { ascending: false });

    // Apply filters based on user role
    if (req.user.role === 'tourist') {
      query = query.eq('tourist_id', req.user.id);
    }

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);
    if (severity) query = query.eq('severity', severity);

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: alerts, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
};

exports.updateAlertStatus = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { status, notes } = req.body;

    // Get the alert first
    const { data: existingAlert, error: fetchError } = await supabase
      .from('alerts')
      .select('*')
      .eq('id', alertId)
      .single();

    if (fetchError || !existingAlert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Check permissions
    if (req.user.role === 'tourist' && existingAlert.tourist_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prepare update data
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    if (!existingAlert.assigned_to && ['police', 'admin', 'tourism_dept'].includes(req.user.role)) {
      updateData.assigned_to = req.user.id;
    }

    // Add response record
    const currentResponses = existingAlert.responses || [];
    const newResponse = {
      responder_id: req.user.id,
      action: `Status changed to ${status}`,
      timestamp: new Date().toISOString(),
      notes: notes || ''
    };
    updateData.responses = JSON.stringify([...currentResponses, newResponse]);

    // Update alert
    const { data: updatedAlert, error: updateError } = await supabase
      .from('alerts')
      .update(updateData)
      .eq('id', alertId)
      .select(`
        *,
        user_profiles:tourist_id (name, phone),
        assigned_user:assigned_to (name)
      `)
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({
      message: 'Alert updated successfully',
      alert: updatedAlert
    });

  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
};

exports.getNearbyAlerts = async (req, res) => {
  try {
    const { latitude, longitude, radius = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    // Use PostGIS for geospatial query
    const { data: alerts, error } = await supabase
      .rpc('get_alerts_near_location', {
        lat: parseFloat(latitude),
        lng: parseFloat(longitude),
        radius_meters: parseInt(radius)
      });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ alerts });

  } catch (error) {
    console.error('Get nearby alerts error:', error);
    res.status(500).json({ error: 'Failed to get nearby alerts' });
  }
};

// Helper function to notify authorities
async function notifyAuthorities(alert) {
  try {
    // This would integrate with your notification system
    // For now, we'll just log it
    console.log(`🚨 NEW ALERT: ${alert.type} - ${alert.severity} - Tourist: ${alert.user_profiles?.name}`);
    
    // You can add SMS, email, or push notification logic here
    // Example: await sendSMS(policeNumbers, alertMessage);
    
  } catch (error) {
    console.error('Notification error:', error);
  }
}

module.exports = {
  createAlert: exports.createAlert,
  getAlerts: exports.getAlerts,
  updateAlertStatus: exports.updateAlertStatus,
  getNearbyAlerts: exports.getNearbyAlerts
};

