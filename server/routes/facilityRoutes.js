const express = require('express');
const router = express.Router();
const Facility = require('../models/Facility');
const queueController = require('../controllers/queueController');

// GET /api/facility - List all facilities
router.get('/', async (req, res) => {
  try {
    const facilities = await Facility.find({});
    res.json(facilities);
  } catch (error) {
    console.error('Error fetching facilities:', error);
    res.status(500).json({ error: 'Server error fetching facilities' });
  }
});

// GET /api/facility/:id/queue - Live queue state for a facility
router.get('/:id/queue', queueController.getFacilityQueue);

module.exports = router;
