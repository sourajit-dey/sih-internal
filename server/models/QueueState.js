const mongoose = require('mongoose');

const QueueStateSchema = new mongoose.Schema({
  facilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Facility',
    required: true
  },
  department: {
    type: String,
    required: true
  },
  currentTokenNumber: {
    type: Number,
    default: 0,
    required: true
  },
  avgWaitMinutes: {
    type: Number,
    default: 10,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('QueueState', QueueStateSchema);
