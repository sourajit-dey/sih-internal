const express = require('express');
const router = express.Router();
const https = require('https');
const Facility = require('../models/Facility');
const Doctor = require('../models/Doctor');
const queueController = require('../controllers/queueController');

// URL of the public hospital registry directory
const PUBLIC_API_URL = 'https://raw.githubusercontent.com/sourajit-dey/sih-internal/main/public-hospitals.json';

// Helper: Universal HTTPS GET for JSON (works on all Node.js versions)
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP Status ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// Helper: Sync facilities from public registry to MongoDB
async function syncWithPublicAPI() {
  try {
    const publicFacilities = await fetchJSON(PUBLIC_API_URL);
    if (!Array.isArray(publicFacilities) || publicFacilities.length === 0) return;

    for (const item of publicFacilities) {
      let facility = await Facility.findOne({ name: item.name });
      if (!facility) {
        facility = new Facility({
          name: item.name,
          facilityCode: item.facilityCode || '',
          type: item.type || 'PHC',
          location: item.location,
          address: item.address || '',
          district: item.district || 'Mumbai',
          state: item.state || 'Maharashtra',
          departments: item.departments || ['General Medicine']
        });
        await facility.save();
      } else {
        facility.facilityCode = item.facilityCode || facility.facilityCode;
        facility.type = item.type || facility.type;
        facility.location = item.location || facility.location;
        facility.address = item.address || facility.address;
        facility.district = item.district || facility.district;
        facility.state = item.state || facility.state;
        facility.departments = item.departments || facility.departments;
        await facility.save();
      }

      const docCount = await Doctor.countDocuments({ facilityId: facility._id });
      if (docCount === 0) {
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
    console.warn('[API Sync Warn] Could not sync with public hospital API. Serving cached database records:', error.message);
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
