const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const cors = require('cors');

// Import models
const Facility = require('../models/Facility');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Token = require('../models/Token');
const QueueState = require('../models/QueueState');
const HistoricalVolume = require('../models/HistoricalVolume');

// Import controllers/routes
const queueController = require('../controllers/queueController');

async function runVerification() {
  console.log('--- STARTING FLOW VERIFICATION ---');
  let mongoServer;
  
  try {
    // 1. Initialize In-Memory DB
    console.log('Spinning up temporary MongoDB Memory Server...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    console.log(`Temp DB running at: ${uri}`);

    await mongoose.connect(uri);
    console.log('Connected to Temp DB.');

    // 2. Run Seeding
    console.log('Running database seeding...');
    const seedDatabase = require('./seed');
    await seedDatabase(uri);
    console.log('Database seeded.');

    // 3. Set up Express App for testing
    const app = express();
    app.use(express.json());
    
    // Mock socket.io to avoid socket binding issues in test
    const mockIo = {
      to: () => ({
        emit: (event, data) => {
          console.log(`[TEST SOCKET EMIT] Event: ${event}, Data:`, JSON.stringify(data || {}));
        }
      }),
      emit: (event, data) => {
        console.log(`[TEST SOCKET EMIT GLOBAL] Event: ${event}`);
      }
    };
    app.set('socketio', mockIo);

    // Bind routes
    app.use('/api/token', require('../routes/tokenRoutes'));
    app.use('/api/facility', require('../routes/facilityRoutes'));
    app.use('/api/admin', require('../routes/adminRoutes'));
    app.get('/api/redirect-suggestion', queueController.getRedirects);

    const testServer = http.createServer(app);
    const PORT = 5999;
    
    await new Promise((resolve) => testServer.listen(PORT, resolve));
    console.log(`Test Express server listening on port ${PORT}`);

    // Helper fetch client
    const request = async (path, method = 'GET', body = null) => {
      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path,
          method,
          headers: {
            'Content-Type': 'application/json'
          }
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              resolve({
                status: res.statusCode,
                body: JSON.parse(data)
              });
            } catch (err) {
              resolve({ status: res.statusCode, body: data });
            }
          });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    };

    // --- TEST CASE 1: Fetch Facilities ---
    console.log('\n--- TEST CASE 1: Fetch Facilities ---');
    const facRes = await request('/api/facility');
    if (facRes.status !== 200 || facRes.body.length !== 3) {
      throw new Error(`Failed to fetch 3 facilities, status: ${facRes.status}, count: ${facRes.body.length}`);
    }
    console.log(`Success: Found ${facRes.body.length} facilities.`);
    const distHospital = facRes.body.find(f => f.type === 'district_hospital');
    console.log(`District Hospital: ${distHospital.name} (${distHospital._id})`);

    // --- TEST CASE 2: Issue Token & Trigger Redirect Suggestions ---
    console.log('\n--- TEST CASE 2: Issue Token on Overloaded Hospital ---');
    const tokenRes = await request('/api/token', 'POST', {
      facilityId: distHospital._id,
      department: 'General Medicine',
      patientName: 'Test Patient Flow',
      patientPhone: '+919876543210'
    });

    if (tokenRes.status !== 201) {
      throw new Error(`Failed to issue token, status: ${tokenRes.status}, body: ${JSON.stringify(tokenRes.body)}`);
    }

    console.log(`Success: Issued Token Number: #${tokenRes.body.token.tokenNumber}`);
    console.log(`Wait time estimated: ${tokenRes.body.waitMinutes} mins`);
    console.log(`Redirect Suggestions count: ${tokenRes.body.redirectSuggestions.length}`);
    
    if (tokenRes.body.waitMinutes < 45) {
      throw new Error(`Expected wait minutes to be >= 45, got: ${tokenRes.body.waitMinutes}`);
    }
    if (tokenRes.body.redirectSuggestions.length === 0) {
      throw new Error('Expected redirect suggestions to be generated, got none.');
    }
    console.log('Redirect suggestion list:');
    tokenRes.body.redirectSuggestions.forEach(s => {
      console.log(` - ${s.name} (~${s.avgWaitMinutes} mins wait, ${s.distanceKm} km away)`);
    });

    const tokenId = tokenRes.body.token._id;

    // --- TEST CASE 3: Get Token Status ---
    console.log('\n--- TEST CASE 3: Fetch Token Status ---');
    const statusRes = await request(`/api/token/${tokenId}`);
    if (statusRes.status !== 200 || statusRes.body.token.tokenNumber !== tokenRes.body.token.tokenNumber) {
      throw new Error(`Failed to fetch correct token status, body: ${JSON.stringify(statusRes.body)}`);
    }
    console.log(`Success: Token status: ${statusRes.body.token.status}, position in queue: ${statusRes.body.position}`);

    // --- TEST CASE 4: Advance Queue ---
    console.log('\n--- TEST CASE 4: Advance Queue (Mark Done) ---');
    const doctor = await Doctor.findOne({ facilityId: distHospital._id, department: 'General Medicine' });
    
    const advanceRes = await request('/api/admin/queue/advance', 'POST', {
      facilityId: distHospital._id,
      department: 'General Medicine',
      doctorId: doctor._id
    });

    if (advanceRes.status !== 200) {
      throw new Error(`Failed to advance queue, status: ${advanceRes.status}, body: ${JSON.stringify(advanceRes.body)}`);
    }
    console.log(`Success: Current Token advanced to: #${advanceRes.body.currentTokenNumber}`);
    console.log(`New Doctor consultation pace: ${advanceRes.body.avgWaitMinutes} mins`);

    // Verify token #1 is marked done
    const t1 = await Token.findOne({ facilityId: distHospital._id, department: 'General Medicine', tokenNumber: 1 });
    if (t1.status !== 'done') {
      throw new Error(`Expected token #1 to be done, got: ${t1.status}`);
    }
    console.log('Token #1 is successfully marked "done".');

    // Verify token #2 is marked in_progress
    const t2 = await Token.findOne({ facilityId: distHospital._id, department: 'General Medicine', tokenNumber: 2 });
    if (t2.status !== 'in_progress') {
      throw new Error(`Expected token #2 to be in_progress, got: ${t2.status}`);
    }
    console.log('Token #2 is successfully marked "in_progress".');

    // --- TEST CASE 5: Predictions ---
    console.log('\n--- TEST CASE 5: Fetch Predictions & Reallocation Orders ---');
    const predRes = await request('/api/admin/predictions');
    if (predRes.status !== 200) {
      throw new Error(`Failed to fetch predictions, status: ${predRes.status}`);
    }
    console.log(`Success: Predicted month: ${predRes.body.targetMonth}`);
    const dhPred = predRes.body.predictions.find(p => p.facilityName === 'City District Hospital');
    const medPred = dhPred.predictions.find(p => p.department === 'General Medicine');
    console.log(`General Medicine Spike Index: ${medPred.spikeIndex}x (Forecast: ${medPred.predictedVolume} patients/wk)`);
    console.log(`Reallocation Recommendation: ${medPred.recommendation}`);

    if (medPred.spikeIndex < 1.5) {
      throw new Error(`Expected General Medicine spike index >= 1.5, got: ${medPred.spikeIndex}`);
    }

    // Shut down servers
    await new Promise((resolve) => testServer.close(resolve));
    await mongoose.connection.close();
    await mongoServer.stop();
    
    console.log('\n--- FLOW VERIFICATION SUCCESSFUL ---');
    process.exit(0);

  } catch (error) {
    console.error('\n--- FLOW VERIFICATION FAILED ---');
    console.error(error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
    process.exit(1);
  }
}

runVerification();
