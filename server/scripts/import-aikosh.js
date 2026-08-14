require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Facility = require('../models/Facility');
const Doctor = require('../models/Doctor');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/queue-balancer';

async function importAiKoshDataset(filePath) {
  if (!filePath) {
    console.error('Error: Please provide a file path to your AI Kosh dataset.');
    console.log('Usage: node scripts/import-aikosh.js <path-to-dataset.json-or-csv>');
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found at ${absolutePath}`);
    process.exit(1);
  }

  console.log(`[AI Kosh Importer] Connecting to MongoDB...`);
  await mongoose.connect(MONGODB_URI);

  let rawData = fs.readFileSync(absolutePath, 'utf8');
  let records = [];

  if (absolutePath.endsWith('.json')) {
    records = JSON.parse(rawData);
  } else if (absolutePath.endsWith('.csv')) {
    // Simple CSV parser
    const lines = rawData.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
      console.error('Error: CSV file must contain a header and at least one data row.');
      process.exit(1);
    }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      records.push(obj);
    }
  } else {
    console.error('Error: Unsupported file format. Please provide a .json or .csv file.');
    process.exit(1);
  }

  console.log(`[AI Kosh Importer] Found ${records.length} records in dataset. Processing...`);

  let count = 0;
  for (const item of records) {
    // Normalize field names from various AI Kosh / OGD dataset schemas
    const name = item.name || item.Facility_Name || item.hospital_name || item.Hospital_Name || item['Facility Name'];
    if (!name) continue;

    const lat = parseFloat(item.lat || item.latitude || item.Latitude || item.lat_deg || 19.076);
    const lng = parseFloat(item.lng || item.longitude || item.Longitude || item.long_deg || 72.877);
    const code = item.facilityCode || item.Facility_Code || item.hfr_id || item.ID || `AIKOSH-${count + 1}`;
    const type = (item.type || item.Facility_Type || item.hospital_type || '').toLowerCase().includes('phc') ? 'PHC' : 'district_hospital';
    const address = item.address || item.Address || item.location_address || '';
    const district = item.district || item.District || item.district_name || 'Mumbai';
    const state = item.state || item.State || item.state_name || 'Maharashtra';
    const departments = item.departments || ['General Medicine', 'Pediatrics', 'Orthopedics'];

    let facility = await Facility.findOne({ name });
    if (!facility) {
      facility = new Facility({
        facilityCode: code,
        name,
        type,
        location: { lat, lng },
        address,
        district,
        state,
        departments
      });
      await facility.save();
      console.log(`[+] Created Facility: ${name} (${district})`);
    } else {
      console.log(`[*] Facility already exists: ${name}`);
    }

    // Auto-generate mock doctors if missing
    const docCount = await Doctor.countDocuments({ facilityId: facility._id });
    if (docCount === 0) {
      for (const dept of departments) {
        await Doctor.create({
          facilityId: facility._id,
          name: `Dr. ${dept.split(' ')[0]} Specialist`,
          department: dept,
          avgConsultMinutes: 10
        });
      }
    }
    count++;
  }

  console.log(`\n=========================================`);
  console.log(` Successfully imported ${count} facilities into MongoDB Atlas!`);
  console.log(`=========================================\n`);
  
  await mongoose.connection.close();
}

const targetFile = process.argv[2];
importAiKoshDataset(targetFile).catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
