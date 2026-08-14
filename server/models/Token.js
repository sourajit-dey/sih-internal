const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  facilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Facility',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  department: {
    type: String,
    required: true
  },
  tokenNumber: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['waiting', 'in_progress', 'done', 'redirected'],
    default: 'waiting',
    required: true
  },
  estimatedTime: {
    type: Date,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Token', TokenSchema);
