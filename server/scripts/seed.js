require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Facility = require('../models/Facility');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Token = require('../models/Token');
const QueueState = require('../models/QueueState');
const HistoricalVolume = require('../models/HistoricalVolume');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/queue-balancer';

async function seedDatabase(customUri) {
  const uri = customUri || MONGODB_URI;
  
  // If we are not already connected, connect now
  let shouldClose = false;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    shouldClose = true;
  }

  // Clear existing data
  await Facility.deleteMany({});
  await Doctor.deleteMany({});
  await Patient.deleteMany({});
  await Token.deleteMany({});
  await QueueState.deleteMany({});
  await HistoricalVolume.deleteMany({});

  // 1. Seed Facilities (Matching AI Kosh / ABDM National Health Directory)
  const facilities = await Facility.create([
    {
      facilityCode: 'HFR-MH-MUM-001',
      name: 'Lokmanya Tilak Municipal General Hospital (Sion Hospital)',
      type: 'district_hospital',
      location: { lat: 19.0360, lng: 72.8600 },
      address: 'Sion West, Mumbai, Maharashtra 400022',
      district: 'Mumbai City',
      state: 'Maharashtra',
      departments: ['General Medicine', 'Pediatrics', 'Orthopedics']
    },
    {
      facilityCode: 'HFR-MH-MUM-002',
      name: 'Dharavi Urban Health Centre (PHC)',
      type: 'PHC',
      location: { lat: 19.0430, lng: 72.8550 },
      address: '90 Feet Road, Dharavi, Mumbai, Maharashtra 400017',
      district: 'Mumbai City',
      state: 'Maharashtra',
      departments: ['General Medicine', 'Pediatrics']
    },
    {
      facilityCode: 'HFR-MH-MUM-003',
      name: 'Kurla Sub-District Health Centre (PHC)',
      type: 'PHC',
      location: { lat: 19.0650, lng: 72.8790 },
      address: 'SG Barve Marg, Kurla West, Mumbai, Maharashtra 400070',
      district: 'Mumbai Suburban',
      state: 'Maharashtra',
      departments: ['General Medicine', 'Pediatrics']
    },
    {
      facilityCode: 'HFR-MH-MUM-004',
      name: 'Bandra KB Bhabha Municipal Hospital',
      type: 'district_hospital',
      location: { lat: 19.0540, lng: 72.8340 },
      address: 'RK Patkar Marg, Bandra West, Mumbai, Maharashtra 400050',
      district: 'Mumbai Suburban',
      state: 'Maharashtra',
      departments: ['General Medicine', 'Pediatrics', 'Orthopedics']
    }
  ]);

  const distHospital = facilities[0];
  const phcEast = facilities[1];
  const phcWest = facilities[2];

  // 2. Seed Doctors
  const doctors = await Doctor.create([
    // District Hospital
    { facilityId: distHospital._id, name: 'Dr. Ramesh Sharma', department: 'General Medicine', avgConsultMinutes: 8 },
    { facilityId: distHospital._id, name: 'Dr. Anita Verma', department: 'Pediatrics', avgConsultMinutes: 10 },
    { facilityId: distHospital._id, name: 'Dr. Suresh Mehta', department: 'Orthopedics', avgConsultMinutes: 12 },
    // PHC East
    { facilityId: phcEast._id, name: 'Dr. Alok Patel', department: 'General Medicine', avgConsultMinutes: 6 },
    { facilityId: phcEast._id, name: 'Dr. Deepa Joshi', department: 'Pediatrics', avgConsultMinutes: 8 },
    // PHC West
    { facilityId: phcWest._id, name: 'Dr. Sandeep Rao', department: 'General Medicine', avgConsultMinutes: 7 },
    { facilityId: phcWest._id, name: 'Dr. Sunita Nair', department: 'Pediatrics', avgConsultMinutes: 9 }
  ]);

  // 3. Seed Patients & Queue Backlog
  const deptGenMed = 'General Medicine';
  const docGenMedDist = doctors.find(d => d.facilityId.toString() === distHospital._id.toString() && d.department === deptGenMed);
  
  // Create 18 patient documents
  const patientsData = [];
  for (let i = 1; i <= 18; i++) {
    patientsData.push({
      name: `Backlog Patient ${i}`,
      phone: `+9199000000${String(i).padStart(2, '0')}`
    });
  }
  const patients = await Patient.create(patientsData);

  // Create tokens for these patients at the City District Hospital
  const now = new Date();
  const tokensData = [];
  const avgConsult = docGenMedDist.avgConsultMinutes;

  for (let i = 0; i < patients.length; i++) {
    // Estimated time: now + (index * avgConsult) minutes
    const estimatedTime = new Date(now.getTime() + i * avgConsult * 60 * 1000);
    tokensData.push({
      patientId: patients[i]._id,
      facilityId: distHospital._id,
      doctorId: docGenMedDist._id,
      department: deptGenMed,
      tokenNumber: i + 1,
      status: i === 0 ? 'in_progress' : 'waiting', // first is currently being treated
      estimatedTime: estimatedTime
    });
  }
  await Token.create(tokensData);

  // Initialize QueueStates for all facilities and departments
  const queueStatesData = [
    { facilityId: distHospital._id, department: 'General Medicine', currentTokenNumber: 1, avgWaitMinutes: avgConsult },
    { facilityId: distHospital._id, department: 'Pediatrics', currentTokenNumber: 0, avgWaitMinutes: 10 },
    { facilityId: distHospital._id, department: 'Orthopedics', currentTokenNumber: 0, avgWaitMinutes: 12 },
    { facilityId: phcEast._id, department: 'General Medicine', currentTokenNumber: 0, avgWaitMinutes: 6 },
    { facilityId: phcEast._id, department: 'Pediatrics', currentTokenNumber: 0, avgWaitMinutes: 8 },
    { facilityId: phcWest._id, department: 'General Medicine', currentTokenNumber: 0, avgWaitMinutes: 7 },
    { facilityId: phcWest._id, department: 'Pediatrics', currentTokenNumber: 0, avgWaitMinutes: 9 }
  ];

  await QueueState.create(queueStatesData);

  // 4. Seed Historical Volume Data (last 365 days)
  const historicalData = [];
  const millisecondPerDay = 24 * 60 * 60 * 1000;
  
  for (let day = 365; day >= 1; day--) {
    const date = new Date(now.getTime() - day * millisecondPerDay);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const month = date.getMonth();
    const isMonsoonSpike = month === 5 || month === 6 || month === 7 || month === 8; // June to September (Monsoon)
    
    for (const fac of facilities) {
      for (const dept of fac.departments) {
        let baseCount = fac.type === 'district_hospital' ? 30 : 10;
        if (isWeekend) baseCount = Math.floor(baseCount * 0.4);
        
        let seasonalMultiplier = 1.0;
        if (dept === 'General Medicine' && isMonsoonSpike) {
          seasonalMultiplier = 2.5;
        } else if (dept === 'Pediatrics' && month === 11) {
          seasonalMultiplier = 1.8;
        }
        
        const randomNoise = Math.floor((Math.random() - 0.5) * (baseCount * 0.3));
        const patientCount = Math.max(1, Math.floor(baseCount * seasonalMultiplier) + randomNoise);
        
        historicalData.push({
          facilityId: fac._id,
          department: dept,
          date: date,
          patientCount: patientCount
        });
      }
    }
  }
  
  const batchSize = 1000;
  for (let i = 0; i < historicalData.length; i += batchSize) {
    const batch = historicalData.slice(i, i + batchSize);
    await HistoricalVolume.insertMany(batch);
  }

  console.log('Seeding process complete in-memory or to DB.');

  if (shouldClose) {
    await mongoose.connection.close();
  }
}

// Run immediately if this script is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Standalone seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Standalone seeding failed:', err);
      process.exit(1);
    });
}

module.exports = seedDatabase;
