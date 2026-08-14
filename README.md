# QueueBalancer — Smart Hospital Waiting-List & OPD Queue Balancer

A dynamic queue balancing and patient redirection platform built for a college internal hackathon feeding into the **Smart India Hackathon (SIH)**.

It resolves congestion at large district hospitals by dynamically generating OPD tokens, monitoring real-time doctor consulting pace, and active load-balancing/redirecting patients to underutilized nearby Primary Health Centres (PHCs). Additionally, the district administration dashboard includes predictive analytics forecasting seasonal disease surges (e.g., monsoon malaria/dengue spikes) to issue doctor reallocation orders.

---

## Key Features

1. **Dynamic Token & Window Estimates**: Patients register online, generate an OPD token, and receive a live estimated consultation arrival window (via mock SMS + web).
2. **Auto-Calculated Consulting Pace**: When doctor sessions are marked done, the engine recalculates the doctor's average consulting speed using an Exponential Moving Average (EMA) and updates wait times for all downstream patients in real time.
3. **Cross-Facility Redirections**: If a patient's estimated wait time exceeds **45 minutes**, the load balancer calculates distance/wait times at nearby PHCs and surfaces 1-2 alternate centers where they can be seen immediately.
4. **Real-time Synchronization**: Powered by **Socket.io** rooms, patients tracking their token see countdowns update dynamically, and admin grids reflect patient visits instantaneously.
5. **Disease-Spike Forecasting**: Uses a year of daily patient volume counts to run seasonal forecasts. If a spike is predicted, it triggers critical warnings suggesting reallocation of medical staff from underutilized PHCs to overloaded clinics.
6. **Zero-Setup Database Fallback**: Spins up an automatic in-memory MongoDB database (`mongodb-memory-server`) if no external connection is configured, pre-seeding clinics, doctors, patients, and volume charts.

---

## Tech Stack

* **Frontend**: React (Vite, React Router v7, Lucide Icons)
* **Styling**: Tailwind CSS v4 (configured via `@tailwindcss/vite` matching Vercel's clean ink-and-canvas design spec)
* **Backend**: Node.js, Express, Socket.io
* **Database**: MongoDB (Mongoose schemas)
* **Realtime**: WebSockets

---

## Project Structure

```
/client                 # React + Vite + Tailwind CSS v4
  /src
    /pages
      Home.jsx            # Patient landing — issues tokens & shows redirect recommendations
      TokenStatus.jsx      # Live token tracking view (Socket.io room subscriber)
      AdminDashboard.jsx   # Live district-wide status and advance queue panel
      Predictions.jsx      # Seasonal disease forecasts & staffing reallocation order panel
    /lib
      socket.js            # Socket.io client setup
      api.js                # Fetch wrappers
/server                 # Express + Mongoose + Socket.io
  /models
    Facility.js           # Clinics & locations
    Doctor.js             # Doctors & consult speeds
    Patient.js            # Patient profiles
    Token.js              # Active OPD tokens
    QueueState.js         # Facility department states
    HistoricalVolume.js   # Seeding for predictive models
  /routes
    tokenRoutes.js
    facilityRoutes.js
    adminRoutes.js
  /controllers
    queueController.js    # Pace calculations, redirection checks, queue advance logic
  /sockets
    queueSocket.js         # Socket room subscriptions
  /scripts
    seed.js               # Database seeding (3 centers, backlog patients, volume history)
    verify-flow.js        # Automated end-to-end integration test runner
  server.js               # Express entrypoint & database fallbacks
DESIGN.md                 # UI style guide
```

---

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+ recommended)

### Step 1: Install Dependencies

**Install Backend Dependencies:**
```bash
cd server
npm install
```

**Install Frontend Dependencies:**
```bash
cd ../client
npm install
```

### Step 2: Configure Environment (Optional)
If you want to use a persistent database, create a `.env` file in the `/server` folder:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/queue-balancer
```
*Note: If no `.env` or `MONGODB_URI` is specified, the server will automatically spawn an in-memory database (`mongodb-memory-server`) and seed sample data on start.*

### Step 3: Run the Application

**Run Backend API Server:**
```bash
cd server
npm run dev
```

**Run Frontend Client:**
```bash
cd client
npm run dev
```
Open **`http://localhost:5173/`** to view the app!

---

## Automated Verification Flow

To verify that the database seeding, token calculations, redirect logic, queue advancement, and prediction forecasts are all functional, run the automated integration test:
```bash
cd server
node scripts/verify-flow.js
```
