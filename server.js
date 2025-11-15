const express = require('express');
const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const bodyParser = require('body-parser');
const path = require('path');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/comp3810sef_db';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'your-secret-key-change-in-production'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

// Routes

// Home page - redirect to login if not authenticated
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Login page
app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

// Login handler
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render('login', { error: 'Please provide both username and password' });
    }

    // Find user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    // Set session
    req.session.userId = user._id.toString();
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'An error occurred during login' });
  }
});

// Signup page
app.get('/signup', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('signup', { error: null });
});

// Signup handler
app.post('/signup', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.render('signup', { error: 'Please fill in all fields' });
    }

    if (password.length < 6) {
      return res.render('signup', { error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });

    if (existingUser) {
      return res.render('signup', { error: 'Username or email already exists' });
    }

    // Create new user
    const user = new User({ username, password, email });
    await user.save();

    // Auto login after signup
    req.session.userId = user._id.toString();
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === 11000) {
      return res.render('signup', { error: 'Username or email already exists' });
    }
    res.render('signup', { error: 'An error occurred during signup' });
  }
});

// Logout handler
app.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

// Dashboard (protected route)
app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', { 
    username: req.session.username 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
// Read page (list users)
app.get('/read', requireAuth, async (req, res) => {
  try {
    const users = await User.find(); 
    res.render('read', { users }); 
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Error fetching users');
  }
});
// Read API (GET all users)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find(); 
    res.json(users); 
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Error fetching users' });
  }
});


