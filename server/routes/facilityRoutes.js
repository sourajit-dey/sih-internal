const express = require('express');
const router = express.Router();
const Facility = require('../models/Facility');
const Doctor = require('../models/Doctor');
const queueController = require('../controllers/queueController');

// URL of the public hospital registry directory
const PUBLIC_API_URL = 'https://raw.githubusercontent.com/sourajit-dey/sih-internal/main/public-hospitals.json';

// Helper: Sync facilities from public registry to MongoDB
async function syncWithPublicAPI() {
  try {
    console.log(`[API Sync] Fetching public hospital directory from: ${PUBLIC_API_URL}`);
    const response = await fetch(PUBLIC_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch public registry: ${response.status} ${response.statusText}`);
    }
    const publicFacilities = await response.json();
    console.log(`[API Sync] Loaded ${publicFacilities.length} facilities from public registry.`);

    for (const item of publicFacilities) {
      // Find or create facility in DB by name
      let facility = await Facility.findOne({ name: item.name });
      if (!facility) {
        facility = new Facility({
          name: item.name,
          type: item.type,
          location: item.location,
          departments: item.departments
        });
        await facility.save();
        console.log(`[API Sync] Created new facility in DB: ${facility.name}`);
      } else {
        // Update attributes if changed
        facility.type = item.type;
        facility.location = item.location;
        facility.departments = item.departments;
        await facility.save();
      }

      // Check if this facility has doctors. If not, auto-generate doctors so it is functional!
      const docCount = await Doctor.countDocuments({ facilityId: facility._id });
      if (docCount === 0) {
        console.log(`[API Sync] Auto-generating mock doctors for new facility: ${facility.name}`);
        const mockDocNames = {
          "General Medicine": ["Dr. Rajesh Patel", "Dr. Sunita Rao"],
          "Pediatrics": ["Dr. Amit Sharma", "Dr. Neha Verma"],
          "Orthopedics": ["Dr. Vikram Malhotra", "Dr. Pooja Joshi"]
        };

        for (const dept of facility.departments) {
          const names = mockDocNames[dept] || ["Dr. Sameer Khan"];
          for (const name of names) {
            await Doctor.create({
              facilityId: facility._id,
              name,
              department: dept,
              avgConsultMinutes: 10
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn('[API Sync Warn] Could not sync with public hospital API. Falling back to local MongoDB cache:', error.message);
  }
}

// GET /api/facility - List all facilities
router.get('/', async (req, res) => {
  try {
    await syncWithPublicAPI();
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
