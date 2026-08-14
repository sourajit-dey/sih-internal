import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { Hospital, Users, Clock, PlayCircle, CheckCircle2, ChevronRight, RefreshCw, Layers, ChevronDown } from 'lucide-react';


function AdminDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states for advancing queue
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advanceMessage, setAdvanceMessage] = useState('');

  async function loadDashboardData() {
    try {
      const response = await api.getAdminDashboard();
      setData(response);
      
      // Auto-populate advance queue form selections if not set yet
      if (response.length > 0 && !selectedFacilityId) {
        const firstFac = response[0];
        setSelectedFacilityId(firstFac.facilityId);
        
        if (firstFac.departments.length > 0) {
          const firstDept = firstFac.departments[0];
          setSelectedDept(firstDept.department);
          
          if (firstDept.doctors.length > 0) {
            setSelectedDocId(firstDept.doctors[0].id);
          }
        }
      }
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load district data.');
    } finally {
      setLoading(false);
    }
  }

  // Initial fetch
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Listen to Socket.io events for real-time dashboard updates
  useEffect(() => {
    socket.on('admin:update', () => {
      console.log('Live update triggered for admin dashboard.');
      loadDashboardData();
    });

    return () => {
      socket.off('admin:update');
    };
  }, []);

  // Update form selections when facility or department changes
  useEffect(() => {
    if (!selectedFacilityId) return;
    const fac = data.find(f => f.facilityId === selectedFacilityId);
    if (!fac) return;

    // Validate department selection
    const deptExists = fac.departments?.some(d => d.department === selectedDept);
    let currentDept = selectedDept;
    if (!deptExists && fac.departments?.length > 0) {
      currentDept = fac.departments[0].department;
      setSelectedDept(currentDept);
    }

    // Update doctor selection based on department
    const deptData = fac.departments?.find(d => d.department === currentDept);
    if (deptData && deptData.doctors?.length > 0) {
      const docExists = deptData.doctors.some(doc => doc.id === selectedDocId);
      if (!docExists) {
        setSelectedDocId(deptData.doctors[0].id);
      }
    } else {
      setSelectedDocId('');
    }
  }, [selectedFacilityId, selectedDept, data]);

  const handleFacilityChange = (e) => {
    setSelectedFacilityId(e.target.value);
    setAdvanceMessage('');
  };

  const handleDeptChange = (e) => {
    setSelectedDept(e.target.value);
    setAdvanceMessage('');
  };

  const handleAdvanceQueue = async (e) => {
    e.preventDefault();
    if (!selectedFacilityId || !selectedDept || !selectedDocId) {
      setAdvanceMessage('Please complete the selection fields.');
      return;
    }

    setAdvanceLoading(true);
    setAdvanceMessage('');

    try {
      const res = await api.advanceQueue({
        facilityId: selectedFacilityId,
        department: selectedDept,
        doctorId: selectedDocId
      });
      setAdvanceMessage(`Success! Current Token advanced to #${res.currentTokenNumber}. Doctor Pace: ${res.avgWaitMinutes} mins.`);
      // Dashboard data will auto-update via socket, but let's reload just in case
      loadDashboardData();
    } catch (err) {
      setAdvanceMessage(`Error: ${err.message || 'Failed to advance queue'}`);
    } finally {
      setAdvanceLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-8 h-8 text-link animate-spin" />
        <span className="text-sm font-mono text-mute">Loading dashboard stats...</span>
      </div>
    );
  }

  // Get list of active doctors for form selection
  const selectedFacData = data.find(f => f.facilityId === selectedFacilityId);
  const selectedDeptData = selectedFacData?.departments?.find(d => d.department === selectedDept);
  const currentDoctors = selectedDeptData?.doctors || [];

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-hairline pb-6 gap-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-mute block mb-2">District Command Center</span>
          <h1 className="font-sans font-semibold text-3xl text-ink tracking-tighter leading-none mb-2">
            Live Facility Queue Balancer.
          </h1>
          <p className="text-body text-sm">
            Monitors real-time queue congestion, patient flows, and average consultation pace across the district.
          </p>
        </div>
        <button
          onClick={loadDashboardData}
          className="bg-canvas hover:bg-canvas-soft-2 text-ink border border-hairline hover:border-hairline-strong px-4 py-2 rounded-full text-xs font-semibold font-mono transition flex items-center gap-2 self-start md:self-auto cursor-pointer shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Stats
        </button>
      </div>

      {error && (
        <div className="bg-error-soft border border-error/20 text-error-deep p-4 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Grid of seeded facilities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="font-sans font-semibold text-xl tracking-tight text-ink">Active Facility Grid</h2>
          
          <div className="space-y-6">
            {data.map((facility) => (
              <div 
                key={facility.facilityId} 
                className="bg-canvas border border-hairline rounded-lg shadow-level-3 overflow-hidden"
              >
                {/* Header row */}
                <div className="bg-canvas-soft border-b border-hairline px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Hospital className="w-5 h-5 text-link" />
                    <div>
                      <h3 className="font-sans font-semibold text-base text-ink leading-tight">
                        {facility.name}
                      </h3>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-mute block">
                        Location: {facility.location.lat}, {facility.location.lng}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full self-start sm:self-auto ${
                    facility.type === 'district_hospital' ? 'bg-error-soft text-error-deep' : 'bg-cyan-soft text-cyan-deep'
                  }`}>
                    {facility.type === 'district_hospital' ? 'Overloaded District Hospital' : 'Underutilized PHC'}
                  </span>
                </div>

                {/* Bed & Stock Polish Indicators (P2 requirement) */}
                {facility.beds && facility.stock && (
                  <div className="bg-canvas-soft-2 border-b border-hairline px-6 py-2.5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-body font-mono">
                    <div className="flex items-center">
                      <span className="text-mute uppercase text-[9px] mr-1.5 font-semibold">Beds:</span>
                      <span className="text-ink font-sans font-medium">{facility.beds.available} / {facility.beds.total} available</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-mute uppercase text-[9px] mr-1.5 font-semibold">Paracetamol:</span>
                      <span className={`font-sans font-medium ${facility.stock.paracetamol === 'Critical' ? 'text-error-deep font-semibold' : 'text-ink'}`}>{facility.stock.paracetamol}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-mute uppercase text-[9px] mr-1.5 font-semibold">Oxygen:</span>
                      <span className={`font-sans font-medium ${facility.stock.oxygen === 'Low' ? 'text-error-deep font-semibold' : 'text-ink'}`}>{facility.stock.oxygen}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-mute uppercase text-[9px] mr-1.5 font-semibold">Vaccines:</span>
                      <span className={`font-sans font-medium ${facility.stock.vaccines === 'Critical' ? 'text-error-deep font-semibold' : 'text-ink'}`}>{facility.stock.vaccines}</span>
                    </div>
                  </div>
                )}

                {/* Departments Row */}
                <div className="divide-y divide-hairline">
                  {facility.departments.map((dept) => (
                    <div key={dept.department} className="px-6 py-4 grid grid-cols-1 md:grid-cols-4 items-center gap-4">
                      {/* Dept Name */}
                      <div className="md:col-span-1">
                        <span className="text-sm font-semibold text-ink">{dept.department}</span>
                        <div className="flex items-center gap-1.5 text-xs text-mute mt-1">
                          <Layers className="w-3.5 h-3.5" />
                          <span>{dept.doctors?.length || 0} Doctors</span>
                        </div>
                      </div>

                      {/* Queue Stats */}
                      <div className="grid grid-cols-3 md:col-span-3 gap-4">
                        <div className="text-center md:text-left">
                          <span className="text-[10px] font-mono text-mute uppercase block">Current Token</span>
                          <span className="text-lg font-semibold text-ink">
                            {dept.currentTokenNumber > 0 ? `#${dept.currentTokenNumber}` : 'None'}
                          </span>
                          {dept.inProgressPatient && (
                            <span className="text-[10px] font-mono text-link block truncate mt-0.5" title={dept.inProgressPatient}>
                              In Room: {dept.inProgressPatient}
                            </span>
                          )}
                        </div>

                        <div className="text-center md:text-left">
                          <span className="text-[10px] font-mono text-mute uppercase block">Active Queue</span>
                          <span className="text-lg font-semibold text-ink flex items-center gap-1.5 justify-center md:justify-start">
                            <Users className="w-4 h-4 text-mute" />
                            {dept.activeCount}
                          </span>
                        </div>

                        <div className="text-center md:text-left">
                          <span className="text-[10px] font-mono text-mute uppercase block">Wait Estimate</span>
                          <span className={`text-lg font-semibold flex items-center gap-1.5 justify-center md:justify-start ${
                            dept.totalWaitTime >= 45 ? 'text-warning-deep' : 'text-cyan-deep'
                          }`}>
                            <Clock className="w-4 h-4" />
                            {dept.totalWaitTime}m
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Administration Advance Queue Controller */}
        <div>
          <div className="sticky top-24 bg-canvas border border-hairline p-8 rounded-lg shadow-level-4">
            <h2 className="font-sans font-semibold text-xl tracking-tight text-ink mb-2">OPD Control Panel</h2>
            <p className="text-xs text-mute mb-6 font-mono">For staff/workers to advance consultations</p>

            <form onSubmit={handleAdvanceQueue} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-body uppercase tracking-wider mb-2">Facility</label>
                <div className="relative">
                  <select
                    value={selectedFacilityId}
                    onChange={handleFacilityChange}
                    className="w-full bg-canvas text-ink border border-hairline pl-4 pr-10 rounded-sm text-sm h-10 outline-none focus:border-hairline-strong transition appearance-none cursor-pointer"
                  >
                    {data.map(f => (
                      <option key={f.facilityId} value={f.facilityId}>{f.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-mute absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-body uppercase tracking-wider mb-2">Department</label>
                <div className="relative">
                  <select
                    value={selectedDept}
                    onChange={handleDeptChange}
                    className="w-full bg-canvas text-ink border border-hairline pl-4 pr-10 rounded-sm text-sm h-10 outline-none focus:border-hairline-strong transition appearance-none cursor-pointer"
                  >
                    {(selectedFacData?.departments || []).map(d => (
                      <option key={d.department} value={d.department}>{d.department}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-mute absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-body uppercase tracking-wider mb-2">Doctor In-Charge</label>
                <div className="relative">
                  <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="w-full bg-canvas text-ink border border-hairline pl-4 pr-10 rounded-sm text-sm h-10 outline-none focus:border-hairline-strong transition appearance-none cursor-pointer"
                  >
                    {(currentDoctors || []).map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-mute absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={advanceLoading || !selectedDocId}
                className="w-full bg-primary hover:bg-ink text-on-primary font-sans font-medium text-sm h-12 rounded-full cursor-pointer transition shadow-level-2 mt-4 flex items-center justify-center gap-2 disabled:bg-mute"
              >
                {advanceLoading ? 'Processing...' : 'Mark Next Patient (Done)'}
                {!advanceLoading && <PlayCircle className="w-4 h-4" />}
              </button>
            </form>

            {advanceMessage && (
              <div className={`mt-6 p-4 rounded-md text-xs font-mono border ${
                advanceMessage.startsWith('Success')
                  ? 'bg-cyan-soft/30 border-cyan-deep/15 text-cyan-deep'
                  : 'bg-error-soft/30 border-error/15 text-error-deep'
              }`}>
                {advanceMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
