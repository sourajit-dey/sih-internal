const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  facilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Facility',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  avgConsultMinutes: {
    type: Number,
    default: 10
  }
}, { timestamps: true });

module.exports = mongoose.model('Doctor', DoctorSchema);
