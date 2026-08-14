const Facility = require('../models/Facility');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Token = require('../models/Token');
const QueueState = require('../models/QueueState');
const { sendSMS } = require('../lib/sms');

// Helper: Calculate distance in km between two lat/lng points
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return parseFloat(d.toFixed(1));
}

// Helper: Get redirect suggestions for a department
async function getRedirectSuggestions(currentFacilityId, department) {
  const currentFacility = await Facility.findById(currentFacilityId);
  if (!currentFacility) return [];

  // Find other facilities with this department
  const altFacilities = await Facility.find({
    _id: { $ne: currentFacilityId },
    departments: department
  });

  const suggestions = [];

  for (const facility of altFacilities) {
    // Calculate distance
    const dist = getDistance(
      currentFacility.location.lat,
      currentFacility.location.lng,
      facility.location.lat,
      facility.location.lng
    );

    // Calculate wait time for this department at this alternative facility
    const doctors = await Doctor.find({ facilityId: facility._id, department });
    if (doctors.length === 0) continue;

    // Sum active tokens across all doctors in this department
    let minWait = Infinity;
    for (const doc of doctors) {
      const activeCount = await Token.countDocuments({
        doctorId: doc._id,
        status: { $in: ['waiting', 'in_progress'] }
      });
      const waitTime = activeCount * doc.avgConsultMinutes;
      if (waitTime < minWait) {
        minWait = waitTime;
      }
    }

    if (minWait === Infinity) minWait = 0;

    // Only suggest if wait time is under 45 mins (or at least shorter than the overloaded one)
    suggestions.push({
      facilityId: facility._id,
      name: facility.name,
      type: facility.type,
      location: facility.location,
      distanceKm: dist,
      avgWaitMinutes: minWait
    });
  }

  // Sort by wait time first, then distance
  return suggestions.sort((a, b) => a.avgWaitMinutes - b.avgWaitMinutes || a.distanceKm - b.distanceKm).slice(0, 2);
}

// Helper: Update estimates for a specific doctor's waiting list
async function updateDoctorEstimates(doctorId, io) {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) return;

  const waitingTokens = await Token.find({
    doctorId: doctor._id,
    status: 'waiting'
  }).sort({ tokenNumber: 1 });

  const now = new Date();
  
  // If there's a token currently in_progress, it occupies the doctor.
  // We'll estimate that the first waiting token gets seen after doctor.avgConsultMinutes
  const inProgressCount = await Token.countDocuments({
    doctorId: doctor._id,
    status: 'in_progress'
  });

  for (let i = 0; i < waitingTokens.length; i++) {
    const waitMinutes = (i + inProgressCount) * doctor.avgConsultMinutes;
    const estTime = new Date(now.getTime() + waitMinutes * 60 * 1000);
    
    waitingTokens[i].estimatedTime = estTime;
    await waitingTokens[i].save();

    // Emit live token update
    if (io) {
      io.to(`token:${waitingTokens[i]._id}`).emit('token:update', {
        status: waitingTokens[i].status,
        estimatedTime: estTime,
        position: i + 1
      });
    }
  }
}

// 1. Issue Token
exports.issueToken = async (req, res) => {
  const { facilityId, department, patientName, patientPhone } = req.body;
  const io = req.app.get('socketio');

  try {
    if (!facilityId || !department || !patientName || !patientPhone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const facility = await Facility.findById(facilityId);
    if (!facility) {
      return res.status(404).json({ error: 'Facility not found' });
    }

    if (!facility.departments.includes(department)) {
      return res.status(400).json({ error: `Department ${department} not supported at this facility` });
    }

    // Find/Create Patient
    let patient = await Patient.findOne({ phone: patientPhone });
    if (!patient) {
      patient = await Patient.create({ name: patientName, phone: patientPhone });
    }

    // Find doctor(s) for this department
    const doctors = await Doctor.find({ facilityId, department });
    if (doctors.length === 0) {
      return res.status(404).json({ error: 'No doctor available for this department' });
    }

    // Assign to doctor with the shortest queue
    let assignedDoctor = doctors[0];
    let minQueue = Infinity;

    for (const doc of doctors) {
      const queueLen = await Token.countDocuments({
        doctorId: doc._id,
        status: { $in: ['waiting', 'in_progress'] }
      });
      if (queueLen < minQueue) {
        minQueue = queueLen;
        assignedDoctor = doc;
      }
    }

    // Find max token number issued so far for this facility & department
    const lastToken = await Token.findOne({ facilityId, department }).sort({ tokenNumber: -1 });
    const tokenNumber = lastToken ? lastToken.tokenNumber + 1 : 1;

    // Calculate wait time
    // minQueue is the number of active patients (waiting + in_progress) currently in this doctor's line.
    // The new patient's wait is minQueue * avgConsultMinutes.
    const waitMinutes = minQueue * assignedDoctor.avgConsultMinutes;
    const estimatedTime = new Date(Date.now() + waitMinutes * 60 * 1000);

    // Create Token
    const token = await Token.create({
      patientId: patient._id,
      facilityId,
      doctorId: assignedDoctor._id,
      department,
      tokenNumber,
      status: 'waiting',
      estimatedTime
    });

    // Populate token fields for response
    const populatedToken = await Token.findById(token._id)
      .populate('patientId')
      .populate('facilityId')
      .populate('doctorId');

    // Send SMS Notification
    const smsMessage = `Your token #${tokenNumber} is issued for ${department} at ${facility.name}. Est. wait time: ${waitMinutes} mins. Track live at: http://localhost:5173/token/${token._id}`;
    await sendSMS(patientPhone, smsMessage);

    // Check for redirect suggestions if wait time > 45 minutes
    let redirectSuggestions = [];
    if (waitMinutes >= 45) {
      redirectSuggestions = await getRedirectSuggestions(facilityId, department);
    }

    // Emit live queue updates
    if (io) {
      io.to(`facility:${facilityId}:${department}`).emit('queue:update');
      // If wait is long, push redirect suggestions directly to token room
      if (redirectSuggestions.length > 0) {
        io.to(`token:${token._id}`).emit('redirect:suggested', redirectSuggestions);
      }
    }

    res.status(201).json({
      token: populatedToken,
      waitMinutes,
      redirectSuggestions
    });

  } catch (error) {
    console.error('Error issuing token:', error);
    res.status(500).json({ error: 'Server error while issuing token' });
  }
};

// 2. Get Token Status
exports.getTokenStatus = async (req, res) => {
  const { id } = req.params;

  try {
    const token = await Token.findById(id)
      .populate('patientId')
      .populate('facilityId')
      .populate('doctorId');

    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Calculate current position in line for this doctor
    let position = 0;
    let waitMinutes = 0;

    if (token.status === 'waiting') {
      const waitingAhead = await Token.countDocuments({
        doctorId: token.doctorId._id,
        status: 'waiting',
        tokenNumber: { $lt: token.tokenNumber }
      });
      const inProgressCount = await Token.countDocuments({
        doctorId: token.doctorId._id,
        status: 'in_progress'
      });
      position = waitingAhead + 1;
      waitMinutes = (waitingAhead + inProgressCount) * token.doctorId.avgConsultMinutes;
    } else if (token.status === 'in_progress') {
      position = 0; // Currently being treated
      waitMinutes = 0;
    }

    // Check for redirects if wait time is long and status is still waiting
    let redirectSuggestions = [];
    if (token.status === 'waiting' && waitMinutes >= 45) {
      redirectSuggestions = await getRedirectSuggestions(token.facilityId._id, token.department);
    }

    res.json({
      token,
      position,
      waitMinutes,
      redirectSuggestions
    });

  } catch (error) {
    console.error('Error fetching token status:', error);
    res.status(500).json({ error: 'Server error fetching token status' });
  }
};

// 3. Get Facility Queue State
exports.getFacilityQueue = async (req, res) => {
  const { id } = req.params;
  const { department } = req.query;

  try {
    const query = { facilityId: id };
    if (department) query.department = department;

    const queueStates = await QueueState.find(query).populate('facilityId');
    
    // Fetch active tokens
    const tokens = await Token.find({
      facilityId: id,
      status: { $in: ['waiting', 'in_progress'] }
    })
    .populate('patientId')
    .populate('doctorId')
    .sort({ tokenNumber: 1 });

    res.json({
      queueStates,
      activeTokens: tokens
    });
  } catch (error) {
    console.error('Error fetching facility queue state:', error);
    res.status(500).json({ error: 'Server error fetching queue state' });
  }
};

// 4. Get Explicit Redirect Suggestions
exports.getRedirects = async (req, res) => {
  const { facilityId, department } = req.query;

  try {
    if (!facilityId || !department) {
      return res.status(400).json({ error: 'facilityId and department query parameters are required' });
    }
    const suggestions = await getRedirectSuggestions(facilityId, department);
    res.json(suggestions);
  } catch (error) {
    console.error('Error fetching redirects:', error);
    res.status(500).json({ error: 'Server error fetching redirects' });
  }
};

// 5. Advance Queue (Worker / Doctor action)
exports.advanceQueue = async (req, res) => {
  const { facilityId, department, doctorId } = req.body;
  const io = req.app.get('socketio');

  try {
    if (!facilityId || !department || !doctorId) {
      return res.status(400).json({ error: 'facilityId, department, and doctorId are required' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Find the token currently in progress for this doctor
    const currentActiveToken = await Token.findOne({
      doctorId,
      status: 'in_progress'
    });

    if (currentActiveToken) {
      // Mark it done
      currentActiveToken.status = 'done';
      await currentActiveToken.save();

      // Recalculate average consultation minutes dynamically
      // Time spent = now - updatedAt (which is when it was marked in_progress or created)
      const actualDurationMs = Date.now() - currentActiveToken.updatedAt.getTime();
      const actualDurationMin = actualDurationMs / (60 * 1000);

      // Clamp duration to reasonable boundaries (3 to 20 mins) for demo resilience
      const clampedDuration = Math.max(3, Math.min(20, actualDurationMin));
      
      // Update doctor pace: Exponential moving average
      doctor.avgConsultMinutes = Math.round(doctor.avgConsultMinutes * 0.7 + clampedDuration * 0.3);
      await doctor.save();

      // Send SMS that appointment is finished
      const patient = await Patient.findById(currentActiveToken.patientId);
      if (patient) {
        await sendSMS(patient.phone, `Thank you for your visit! Your consultation in ${department} is complete.`);
      }

      // Notify the specific token room
      if (io) {
        io.to(`token:${currentActiveToken._id}`).emit('token:update', { status: 'done', estimatedTime: null, position: 0 });
      }
    }

    // Find the next waiting token in line for this doctor
    const nextToken = await Token.findOne({
      doctorId,
      status: 'waiting'
    }).sort({ tokenNumber: 1 });

    let currentTokenNumber = 0;

    if (nextToken) {
      nextToken.status = 'in_progress';
      nextToken.estimatedTime = new Date();
      await nextToken.save();
      currentTokenNumber = nextToken.tokenNumber;

      // Notify next patient via SMS
      const patient = await Patient.findById(nextToken.patientId);
      if (patient) {
        await sendSMS(patient.phone, `It is your turn! Please report to the ${department} OPD at once. Token #${nextToken.tokenNumber}.`);
      }

      // Notify specific token room
      if (io) {
        io.to(`token:${nextToken._id}`).emit('token:update', { status: 'in_progress', estimatedTime: nextToken.estimatedTime, position: 0 });
      }
    } else {
      // No next token, grab the last done token number or set to 0
      const lastDone = await Token.findOne({ doctorId, status: 'done' }).sort({ tokenNumber: -1 });
      currentTokenNumber = lastDone ? lastDone.tokenNumber : 0;
    }

    // Update QueueState
    let queueState = await QueueState.findOne({ facilityId, department });
    if (!queueState) {
      queueState = new QueueState({ facilityId, department });
    }
    queueState.currentTokenNumber = currentTokenNumber;
    queueState.avgWaitMinutes = doctor.avgConsultMinutes;
    await queueState.save();

    // Recalculate and save estimates for all remaining waiting tokens for this doctor
    await updateDoctorEstimates(doctorId, io);

    // Emit live queue updates to department room and admin dashboard
    if (io) {
      io.to(`facility:${facilityId}:${department}`).emit('queue:update');
      io.emit('admin:update'); // broadcast to admin dashboard
    }

    res.json({
      message: 'Queue advanced successfully',
      currentTokenNumber,
      avgWaitMinutes: doctor.avgConsultMinutes
    });

  } catch (error) {
    console.error('Error advancing queue:', error);
    res.status(500).json({ error: 'Server error advancing queue' });
  }
};
