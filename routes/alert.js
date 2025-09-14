const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

// All alert routes require authentication
router.use(authenticateToken);

// Create new alert
router.post('/', authorize('tourist'), async (req, res) => {
  try {
    const { type, severity, location, message, additional_data } = req.body;

    // Validation
    if (!type || !location || !location.latitude || !location.longitude) {
      return res.status(400).json({ 
        error: 'Type and location (latitude, longitude) are required' 
      });
    }

    const validTypes = ['panic', 'geofence_violation', 'low_safety_score', 'missing', 'health_emergency', 'suspicious_activity'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        error: `Type must be one of: ${validTypes.join(', ')}` 
      });
    }

    // Create alert in database
    const { data: alert, error: insertError } = await supabase
      .from('alerts')
      .insert({
        tourist_id: req.user.id,
        type: type,
        severity: severity || 'medium',
        location: JSON.stringify(location),
        message: message,
        additional_data: JSON.stringify(additional_data || {}),
        status: 'active'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Alert creation error:', insertError);
      return res.status(500).json({ error: 'Failed to create alert' });
    }

    console.log(`🚨 NEW ALERT: ${type} - ${severity} - Tourist: ${req.user.name}`);

    res.status(201).json({
      message: 'Alert created successfully',
      alert: {
        ...alert,
        tourist_name: req.user.name
      }
    });

  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// Get alerts
router.get('/', async (req, res) => {
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
      alerts: alerts || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Update alert status
router.put('/:alertId/status', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['active', 'acknowledged', 'resolved', 'false_alarm'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Status must be one of: ${validStatuses.join(', ')}` 
      });
    }

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
    updateData.responses = [...currentResponses, newResponse];

    // Update alert
    const { data: updatedAlert, error: updateError } = await supabase
      .from('alerts')
      .update(updateData)
      .eq('id', alertId)
      .select()
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
});

// Panic button - immediate critical alert
router.post('/panic', authorize('tourist'), async (req, res) => {
  try {
    const { location, message } = req.body;

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({ 
        error: 'Location with latitude and longitude required for panic alert' 
      });
    }

    // Create panic alert
    const { data: alert, error: insertError } = await supabase
      .from('alerts')
      .insert({
        tourist_id: req.user.id,
        type: 'panic',
        severity: 'critical',
        location: JSON.stringify(location),
        message: message || 'PANIC BUTTON PRESSED - Immediate assistance required!',
        additional_data: JSON.stringify({ 
          panic_button: true,
          timestamp: new Date().toISOString() 
        }),
        status: 'active'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Panic alert creation error:', insertError);
      return res.status(500).json({ error: 'Failed to create panic alert' });
    }

    console.log(`🚨 PANIC ALERT: Tourist ${req.user.name} pressed panic button!`);

    res.status(201).json({
      message: 'PANIC ALERT CREATED - Authorities notified',
      alert: {
        ...alert,
        tourist_name: req.user.name
      }
    });

  } catch (error) {
    console.error('Panic alert error:', error);
    res.status(500).json({ error: 'Failed to create panic alert' });
  }
});

module.exports = router;
