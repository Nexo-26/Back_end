const { supabase } = require('../utils/supabase');
const Joi = require('joi');

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(50).required(),
  phone: Joi.string().required(),
  role: Joi.string().valid('tourist', 'police', 'admin', 'tourism_dept').optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

exports.register = async (req, res) => {
  try {
    console.log('Registration attempt:', req.body);

    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details.message });
    }

    const { email, password, name, phone, role } = value;

    // Create user in Supabase Auth
    const { data: authData, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        name,
        phone,
        role: role || 'tourist'
      },
      email_confirm: true // Skip email confirmation for development
    });

    if (signUpError) {
      console.error('Auth signup error:', signUpError);
      return res.status(400).json({ error: signUpError.message });
    }

    console.log('User created in auth:', authData.user.id);

    // Create user profile in our database
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        name,
        phone,
        role: role || 'tourist'
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    console.log('User profile created:', profile);

    // Create tourist profile if user is tourist
    if ((role || 'tourist') === 'tourist') {
      const { error: touristError } = await supabase
        .from('tourist_profiles')
        .insert({
          user_id: authData.user.id
        });

      if (touristError) {
        console.error('Tourist profile creation error:', touristError);
        // Continue anyway - main user is created
      }
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        name,
        role: role || 'tourist'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('Login attempt:', { email: req.body.email });

    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details.message });
    }

    const { email, password } = value;

    // Sign in with Supabase
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      console.error('Login error:', signInError);
      return res.status(401).json({ error: signInError.message });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      // Continue with basic user info
    }

    console.log('Login successful for:', profile?.name || data.user.email);

    res.json({
      message: 'Login successful',
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name || data.user.user_metadata?.name,
        role: profile?.role || 'tourist'
      },
      session: data.session
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};
