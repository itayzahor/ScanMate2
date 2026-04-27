/**
 * @file models/User.js
 * Mongoose model for an application user.
 *
 * Users authenticate via Google OAuth. `googleId` links the document to their
 * Google account. `username` is an optional, user-chosen handle set after first login.
 * Both `googleId` and `username` use sparse unique indexes so that multiple
 * documents can have these fields absent without violating uniqueness.
 */
const { Schema, model } = require('mongoose');

const userSchema = new Schema({
  googleId: { type: String, index: true, unique: true, sparse: true }, // Google OAuth `sub` claim; sparse allows future non-Google auth
  email:    { type: String, index: true },
  name:     String,
  picture:  String,                                                      // Google profile photo URL
  username: { type: String, unique: true, sparse: true, trim: true },   // user-chosen handle; optional until explicitly set
}, { timestamps: true });

module.exports = model('User', userSchema);
