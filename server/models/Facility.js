const mongoose = require('mongoose');

const FacilitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  facilityCode: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['PHC', 'district_hospital', 'sub_district_hospital'],
    default: 'PHC'
  },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  address: {
    type: String,
    default: ''
  },
  district: {
    type: String,
    default: 'Mumbai'
  },
  state: {
    type: String,
    default: 'Maharashtra'
  },
  departments: [{
    type: String,
    required: true
  }]
}, { timestamps: true });

module.exports = mongoose.model('Facility', FacilitySchema);
