const mongoose = require('mongoose');

const FacilitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['PHC', 'district_hospital'],
    required: true
  },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  departments: [{
    type: String,
    required: true
  }]
}, { timestamps: true });

module.exports = mongoose.model('Facility', FacilitySchema);
