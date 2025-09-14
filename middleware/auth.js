const { supabase } = require('../utils/supabase');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ');

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Token verification failed:', error);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      // Continue with basic user info
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || 'tourist',
      name: profile?.name || user.user_metadata?.name,
      ...profile
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
    }

    next();
  };
};

// IMPORTANT: Export both functions
module.exports = { authenticateToken, authorize };
