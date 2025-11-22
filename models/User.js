const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: function() {
      return !this.facebookId; // Username required only if not OAuth user
    },
    unique: true,
    sparse: true, // Allows multiple null values
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: function() {
      return !this.facebookId; // Password required only if not OAuth user
    },
    minlength: 6
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  facebookId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values
  },
  provider: {
    type: String,
    enum: ['local', 'facebook'],
    default: 'local'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving (only for local users)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);



