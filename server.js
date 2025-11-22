const express = require('express');
const fsPromises = require('node:fs/promises');
const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const bodyParser = require('body-parser');
const path = require('path');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('./models/User');
const Menu = require('./models/Menu');

const menuCategories = ['Appetizers', 'Main Course', 'Desserts', 'Beverages', 'Sides'];

const app = express();
app.set('view engine', 'ejs');

// MongoDB connection
const mongouri = 'mongodb+srv://s1411330:Ac330609@cluster0.44sr8ws.mongodb.net/?appName=Cluster0';
const dbName = 'assignment';
const collectionName = 'Menu';
const client = new MongoClient(mongouri);
mongoose.connect(mongouri, { dbName })
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
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Passport configuration
app.use(passport.initialize());
// Note: We use cookie-session instead of express-session, so we handle sessions manually

// Passport serialize/deserialize user
passport.serializeUser((user, done) => {
  done(null, user._id.toString());
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Facebook OAuth Strategy
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID || 'YOUR_FACEBOOK_APP_ID',
  clientSecret: process.env.FACEBOOK_APP_SECRET || 'YOUR_FACEBOOK_APP_SECRET',
  callbackURL: process.env.FACEBOOK_CALLBACK_URL || "http://localhost:8099/auth/facebook/callback",
  profileFields: ['id', 'displayName', 'email']
},
async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists with this Facebook ID
    let user = await User.findOne({ facebookId: profile.id });
    
    if (user) {
      // User exists, return it
      return done(null, user);
    }
    
    // Check if user exists with this email (from Facebook)
    if (profile.emails && profile.emails[0]) {
      user = await User.findOne({ email: profile.emails[0].value });
      if (user) {
        // Link Facebook account to existing user
        user.facebookId = profile.id;
        user.provider = 'facebook';
        await user.save();
        return done(null, user);
      }
    }
    
    // Create new user
    const newUser = new User({
      username: profile.displayName || `user_${profile.id}`,
      email: profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@facebook.com`,
      facebookId: profile.id,
      provider: 'facebook'
    });
    
    await newUser.save();
    return done(null, newUser);
  } catch (error) {
    return done(error, null);
  }
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

// Routes

// Public home page
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/home');
  }
  res.render('home');
});


// Login page
app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

// Facebook OAuth routes
app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication
    req.session.userId = req.user._id.toString();
    req.session.username = req.user.username;
    res.redirect('/dashboard');
  }
);

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

// Create menu item (GET)
app.get('/create', requireAuth, (req, res) => {
  res.render('create', {
    username: req.session.username,
    error: null,
    success: null,
    formData: {},
    categories: menuCategories
  });
});

// Create menu item (POST)
app.post('/create', requireAuth, async (req, res) => {
  const { name, category, price, description } = req.body;
  const formData = { name, category, price, description };

  try {
    if (!name || !price) {
      return res.render('create', {
        username: req.session.username,
        error: 'Name and price are required.',
        success: null,
        formData,
        categories: menuCategories
      });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.render('create', {
        username: req.session.username,
        error: 'Price must be a positive number.',
        success: null,
        formData,
        categories: menuCategories
      });
    }

    const normalizedCategory = menuCategories.includes(category) ? category : '';

    const menuItem = new Menu({
      name: name.trim(),
      category: normalizedCategory,
      price: parsedPrice,
      description: description ? description.trim() : ''
    });

    await menuItem.save();

    res.render('create', {
      username: req.session.username,
      error: null,
      success: 'Menu item created successfully!',
      formData: {},
      categories: menuCategories
    });
  } catch (error) {
    console.error('Create menu error:', error);
    res.render('create', {
      username: req.session.username,
      error: 'An error occurred while creating the menu item.',
      success: null,
      formData,
      categories: menuCategories
    });
  }
});

// Update menu items (GET)
app.get('/update', requireAuth, async (req, res) => {
  try {
    const items = await Menu.find().sort({ createdAt: -1 });
    const { id } = req.query;
    let selectedItem = null;

    if (id) {
      selectedItem = await Menu.findById(id);
      if (!selectedItem) {
        return res.render('update', {
          username: req.session.username,
          items,
          selectedItem: null,
          formData: {},
          error: 'Selected item not found.',
          success: null
        });
      }
    }

    res.render('update', {
      username: req.session.username,
      items,
      selectedItem,
      formData: {},
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Update page error:', error);
    res.render('update', {
      username: req.session.username,
      items: [],
      selectedItem: null,
      formData: {},
      error: 'An error occurred while loading menu items.',
      success: null
    });
  }
});

// Update menu item (POST)
app.post('/update/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, category, price, description } = req.body;
  const formData = { name, category, price, description };

  try {
    if (!name || !price) {
      const items = await Menu.find().sort({ createdAt: -1 });
      const selectedItem = await Menu.findById(id);
      return res.render('update', {
        username: req.session.username,
        items,
        selectedItem,
        formData,
        error: 'Name and price are required.',
        success: null
      });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      const items = await Menu.find().sort({ createdAt: -1 });
      const selectedItem = await Menu.findById(id);
      return res.render('update', {
        username: req.session.username,
        items,
        selectedItem,
        formData,
        error: 'Price must be a positive number.',
        success: null
      });
    }

    const updated = await Menu.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        category: category ? category.trim() : '',
        price: parsedPrice,
        description: description ? description.trim() : ''
      },
      { new: true }
    );

    const items = await Menu.find().sort({ createdAt: -1 });

    if (!updated) {
      return res.render('update', {
        username: req.session.username,
        items,
        selectedItem: null,
        formData: {},
        error: 'Menu item not found.',
        success: null
      });
    }

    res.render('update', {
      username: req.session.username,
      items,
      selectedItem: updated,
      formData: {},
      error: null,
      success: 'Menu item updated successfully!'
    });
  } catch (error) {
    console.error('Update menu error:', error);
    const items = await Menu.find().sort({ createdAt: -1 });
    const selectedItem = await Menu.findById(id);
    res.render('update', {
      username: req.session.username,
      items,
      selectedItem,
      formData,
      error: 'An error occurred while updating the menu item.',
      success: null
    });
  }
});

// Delete menu item (POST)
app.post('/delete/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await Menu.findByIdAndDelete(id);
    const items = await Menu.find().sort({ createdAt: -1 });

    if (!deleted) {
      return res.render('update', {
        username: req.session.username,
        items,
        selectedItem: null,
        formData: {},
        error: 'Menu item not found.',
        success: null
      });
    }

    res.render('update', {
      username: req.session.username,
      items,
      selectedItem: null,
      formData: {},
      error: null,
      success: 'Menu item deleted successfully.'
    });
  } catch (error) {
    console.error('Delete menu error:', error);
    const items = await Menu.find().sort({ createdAt: -1 });
    res.render('update', {
      username: req.session.username,
      items,
      selectedItem: null,
      formData: {},
      error: 'An error occurred while deleting the menu item.',
      success: null
    });
  }
});

// Read page & search/filter (protected route) - Menu table
app.get('/read', requireAuth, async (req, res) => {
  try {
    const { name, category = 'all', minPrice, maxPrice } = req.query;

    const query = {};

    if (name) {
      // case-insensitive "contains" search on name
      query.name = { $regex: name, $options: 'i' };
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) {
        query.price.$gte = Number(minPrice);
      }
      if (maxPrice) {
        query.price.$lte = Number(maxPrice);
      }
    }

    const [results, categories] = await Promise.all([
      Menu.find(query).sort({ createdAt: -1 }),
      Menu.distinct('category', { category: { $nin: [null, ''] } })
    ]);

    categories.sort((a, b) => a.localeCompare(b));

    res.render('read', {
      username: req.session.username,
      results,
      categories,
      search: {
        name: name || '',
        category: category || 'all',
        minPrice: minPrice || '',
        maxPrice: maxPrice || ''
      },
      error: null
    });
  } catch (error) {
    console.error('Read/search error:', error);
    res.render('read', {
      username: req.session.username,
      results: [],
      categories: [],
      search: {
        name: req.query.name || '',
        category: req.query.category || 'all',
        minPrice: req.query.minPrice || '',
        maxPrice: req.query.maxPrice || ''
      },
      error: 'An error occurred while searching data'
    });
  }
});

// --------------------------
// RESTful Menu API Endpoints
// --------------------------

const buildMenuQuery = (filters = {}) => {
  const { name, category, minPrice, maxPrice } = filters;
  const query = {};

  if (name) {
    query.name = { $regex: name, $options: 'i' };
  }

  if (category) {
    query.category = category;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {};
    if (minPrice !== undefined) query.price.$gte = Number(minPrice);
    if (maxPrice !== undefined) query.price.$lte = Number(maxPrice);
  }

  return query;
};

const validateMenuPayload = (body, { partial = false } = {}) => {
  const errors = [];
  const data = {};

  if (!partial || body.name !== undefined) {
    if (!body.name || !body.name.trim()) {
      errors.push('Name is required.');
    } else {
      data.name = body.name.trim();
    }
  }

  if (!partial || body.price !== undefined) {
    const parsedPrice = Number(body.price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      errors.push('Price must be a positive number.');
    } else {
      data.price = parsedPrice;
    }
  }

  if (body.category !== undefined) {
    data.category = menuCategories.includes(body.category)
      ? body.category
      : '';
  }

  if (body.description !== undefined) {
    data.description = body.description ? body.description.trim() : '';
  }

  return { data, errors };
};

// List menus with optional filters
app.get('/api/menus', async (req, res) => {
  try {
    const query = buildMenuQuery({
      name: req.query.name,
      category: req.query.category,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice
    });

    const items = await Menu.find(query).sort({ createdAt: -1 });
    res.json({ data: items, count: items.length });
  } catch (error) {
    console.error('API get menus error:', error);
    res.status(500).json({ error: 'Failed to fetch menu items.' });
  }
});

// Retrieve single menu
app.get('/api/menus/:id', async (req, res) => {
  try {
    const item = await Menu.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }
    res.json({ data: item });
  } catch (error) {
    console.error('API get menu error:', error);
    res.status(500).json({ error: 'Failed to fetch the menu item.' });
  }
});

// Create menu
app.post('/api/menus', async (req, res) => {
  const { data, errors } = validateMenuPayload(req.body);
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  try {
    const created = await Menu.create(data);
    res.status(201).json({ message: 'Menu item created.', data: created });
  } catch (error) {
    console.error('API create menu error:', error);
    res.status(500).json({ error: 'Failed to create menu item.' });
  }
});

// Replace menu
app.put('/api/menus/:id', async (req, res) => {
  const { data, errors } = validateMenuPayload(req.body);
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  try {
    const updated = await Menu.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    res.json({ message: 'Menu item updated.', data: updated });
  } catch (error) {
    console.error('API update menu error:', error);
    res.status(500).json({ error: 'Failed to update menu item.' });
  }
});

// Partial update
app.patch('/api/menus/:id', async (req, res) => {
  const { data, errors } = validateMenuPayload(req.body, { partial: true });
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  try {
    const updated = await Menu.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    res.json({ message: 'Menu item updated.', data: updated });
  } catch (error) {
    console.error('API patch menu error:', error);
    res.status(500).json({ error: 'Failed to update menu item.' });
  }
});

// Delete menu
app.delete('/api/menus/:id', async (req, res) => {
  try {
    const deleted = await Menu.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }
    res.json({ message: 'Menu item deleted.' });
  } catch (error) {
    console.error('API delete menu error:', error);
    res.status(500).json({ error: 'Failed to delete menu item.' });
  }
});
// Start server
const PORT = process.env.PORT || 8099;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


