const mongoose = require('mongoose');

const HistoricalVolumeSchema = new mongoose.Schema({
  facilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Facility',
    required: true
  },
  department: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  patientCount: {
    type: Number,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('HistoricalVolume', HistoricalVolumeSchema);
