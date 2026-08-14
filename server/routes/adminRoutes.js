const express = require('express');
const router = express.Router();
const Facility = require('../models/Facility');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const QueueState = require('../models/QueueState');
const HistoricalVolume = require('../models/HistoricalVolume');
const queueController = require('../controllers/queueController');

// GET /api/admin/dashboard - Aggregated view across all facilities
router.get('/dashboard', async (req, res) => {
  try {
    const facilities = await Facility.find({});
    const dashboardData = [];

    for (const facility of facilities) {
      const doctors = await Doctor.find({ facilityId: facility._id });
      const departmentsData = [];

      for (const dept of facility.departments) {
        const deptDoctors = doctors.filter(d => d.department === dept);
        
        // Fetch queue state
        let queueState = await QueueState.findOne({ facilityId: facility._id, department: dept });
        if (!queueState) {
          queueState = { currentTokenNumber: 0, avgWaitMinutes: 10 };
        }

        // Active tokens
        const activeTokensCount = await Token.countDocuments({
          facilityId: facility._id,
          department: dept,
          status: { $in: ['waiting', 'in_progress'] }
        });

        const waitingTokensCount = await Token.countDocuments({
          facilityId: facility._id,
          department: dept,
          status: 'waiting'
        });

        // Compute total wait time
        let totalWaitTime = 0;
        if (deptDoctors.length > 0) {
          // Simplistic wait time: (waiting counts / doctors) * avg consult
          const totalAvgMinutes = deptDoctors.reduce((sum, d) => sum + d.avgConsultMinutes, 0) / deptDoctors.length;
          totalWaitTime = Math.round((waitingTokensCount * totalAvgMinutes) / Math.max(1, deptDoctors.length));
        }

        // Find current patient inside OPD room
        const inProgressToken = await Token.findOne({
          facilityId: facility._id,
          department: dept,
          status: 'in_progress'
        }).populate('patientId');

        departmentsData.push({
          department: dept,
          currentTokenNumber: queueState.currentTokenNumber,
          avgWaitMinutes: queueState.avgWaitMinutes,
          activeCount: activeTokensCount,
          waitingCount: waitingTokensCount,
          totalWaitTime,
          inProgressPatient: inProgressToken ? `${inProgressToken.patientId?.name || 'Patient'} (Token #${inProgressToken.tokenNumber})` : null,
          doctors: deptDoctors.map(d => ({
            id: d._id,
            name: d.name,
            avgConsultMinutes: d.avgConsultMinutes
          }))
        });
      }

      // Generate mock bed & stock data based on facility type for dashboard polish (P2 requirement)
      let mockBeds = { total: 15, available: 11 };
      let mockStock = { paracetamol: 'Adequate', oxygen: 'Adequate', vaccines: 'Low' };

      if (facility.type === 'district_hospital') {
        mockBeds = { total: 120, available: 18 };
        mockStock = { paracetamol: 'Critical', oxygen: 'Adequate', vaccines: 'Critical' };
      } else if (facility.name.includes('East')) {
        mockBeds = { total: 10, available: 4 };
        mockStock = { paracetamol: 'Adequate', oxygen: 'Adequate', vaccines: 'Adequate' };
      }

      dashboardData.push({
        facilityId: facility._id,
        name: facility.name,
        type: facility.type,
        location: facility.location,
        departments: departmentsData,
        beds: mockBeds,
        stock: mockStock
      });
    }

    res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching admin dashboard data:', error);
    res.status(500).json({ error: 'Server error fetching dashboard' });
  }
});

// GET /api/admin/predictions - Seasonal spike predictions
router.get('/predictions', async (req, res) => {
  try {
    const facilities = await Facility.find({});
    const predictions = [];

    // Let's analyze historical volume.
    // If historical volume has no records, we can generate a default response.
    const hasHistory = await HistoricalVolume.countDocuments();
    
    // We want to predict for the current month and next month.
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const nextMonth = (currentMonth + 1) % 12;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    for (const facility of facilities) {
      const deptPredictions = [];
      const doctors = await Doctor.find({ facilityId: facility._id });

      for (const dept of facility.departments) {
        let historicalAverage = 15;
        let predictedVolume = 15;
        let spikeIndex = 1.0;

        if (hasHistory > 0) {
          // Average for this facility/dept across all months
          const allTimeAvg = await HistoricalVolume.aggregate([
            { $match: { facilityId: facility._id, department: dept } },
            { $group: { _id: null, avgCount: { $avg: '$patientCount' } } }
          ]);
          historicalAverage = allTimeAvg[0] ? Math.round(allTimeAvg[0].avgCount) : 15;

          // Average for next month (monsoon / winter spikes)
          const targetMonthAvg = await HistoricalVolume.aggregate([
            {
              $match: {
                facilityId: facility._id,
                department: dept,
                $expr: { $eq: [{ $month: '$date' }, nextMonth + 1] } // $month is 1-12
              }
            },
            { $group: { _id: null, avgCount: { $avg: '$patientCount' } } }
          ]);
          predictedVolume = targetMonthAvg[0] ? Math.round(targetMonthAvg[0].avgCount) : historicalAverage;
          spikeIndex = historicalAverage > 0 ? (predictedVolume / historicalAverage) : 1.0;
        }

        // Generate reallocation recommendation based on spikeIndex
        let recommendation = 'Staffing level is optimal. No reallocation needed.';
        let alertType = 'normal'; // normal, warning, critical

        if (spikeIndex >= 1.8) {
          alertType = 'critical';
          if (facility.type === 'district_hospital') {
            // Overloaded district hospital suggests borrowing from PHC
            recommendation = `CRITICAL: High volume forecast for ${dept} in ${monthNames[nextMonth]} (outbreak risk). Suggest temporarily reallocating 1 doctor from Dharavi PHC East (underutilized) to City District Hospital to balance load.`;
          } else {
            recommendation = `WARNING: Seasonal spike expected in ${dept}. Ensure stock of essential medicines is increased by 50%.`;
          }
        } else if (spikeIndex >= 1.3) {
          alertType = 'warning';
          recommendation = `Moderate spike expected in ${dept}. Increase OPD hours by 1 hour daily to handle extra load.`;
        }

        deptPredictions.push({
          department: dept,
          historicalAverage,
          predictedVolume,
          spikeIndex: parseFloat(spikeIndex.toFixed(2)),
          alertType,
          recommendation
        });
      }

      predictions.push({
        facilityId: facility._id,
        facilityName: facility.name,
        type: facility.type,
        predictions: deptPredictions
      });
    }

    res.json({
      targetMonth: monthNames[nextMonth],
      predictions
    });

  } catch (error) {
    console.error('Error fetching admin predictions:', error);
    res.status(500).json({ error: 'Server error fetching predictions' });
  }
});

// POST /api/queue/advance - Worker advances queue (binds to queueController)
router.post('/queue/advance', queueController.advanceQueue);

module.exports = router;
