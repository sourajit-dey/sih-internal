import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { MapPin, Clock, ArrowRight, CheckCircle, AlertTriangle, ChevronDown, Sparkles } from 'lucide-react';

// Helper: Calculate distance in km between two lat/lng points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
}

function Home() {
  const navigate = useNavigate();
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitEstimate, setWaitEstimate] = useState(null);
  const [redirectSuggestions, setRedirectSuggestions] = useState([]);
  const [userLocation, setUserLocation] = useState(null);

  // Fetch facilities on load
  useEffect(() => {
    async function loadFacilities() {
      try {
        const data = await api.getFacilities();
        if (data.length > 0) {
          // Use default user coordinates (Sion area: 19.068, 72.863) for instant loading without browser popups
          const userLat = 19.068;
          const userLng = 72.863;
          setUserLocation({ lat: userLat, lng: userLng });
          
          const sorted = data.map(f => {
            const dist = calculateDistance(userLat, userLng, f.location.lat, f.location.lng);
            return { ...f, distance: dist };
          }).sort((a, b) => a.distance - b.distance);
          
          setFacilities(sorted);
          setSelectedFacilityId(sorted[0]._id);
          setDepartments(sorted[0].departments || []);
          if (sorted[0].departments?.length > 0) {
            setSelectedDepartment(sorted[0].departments[0]);
          }
        }
      } catch (err) {
        console.error('Error loading facilities:', err);
        setError('Failed to load facilities. Make sure the server is running.');
      }
    }
    loadFacilities();
  }, []);

  // Update departments when facility changes
  const handleFacilityChange = (e) => {
    const facilityId = e.target.value;
    setSelectedFacilityId(facilityId);
    const selected = facilities.find(f => f._id === facilityId);
    if (selected) {
      setDepartments(selected.departments || []);
      setSelectedDepartment(selected.departments?.[0] || '');
    }
    setWaitEstimate(null);
    setRedirectSuggestions([]);
  };

  // Fetch queue wait time estimation for preview
  useEffect(() => {
    if (!selectedFacilityId || !selectedDepartment) return;

    async function loadQueuePreview() {
      try {
        const queueData = await api.getFacilityQueue(selectedFacilityId, selectedDepartment);
        // Find doctor for this department to estimate
        const activeCount = queueData.activeTokens?.length || 0;
        const state = queueData.queueStates?.find(q => q.department === selectedDepartment);
        const avgWait = state ? state.avgWaitMinutes : 10;
        const estWait = activeCount * avgWait;
        
        setWaitEstimate(estWait);

        // Fetch redirect suggestions if estimate is >= 45 minutes
        if (estWait >= 45) {
          const suggestions = await fetch(`http://localhost:5000/api/redirect-suggestion?facilityId=${selectedFacilityId}&department=${selectedDepartment}`).then(res => res.json());
          setRedirectSuggestions(suggestions);
        } else {
          setRedirectSuggestions([]);
        }
      } catch (err) {
        console.error('Error fetching preview:', err);
      }
    }

    const timer = setTimeout(loadQueuePreview, 300);
    return () => clearTimeout(timer);
  }, [selectedFacilityId, selectedDepartment]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientName || !patientPhone) {
      setError('Please fill in your name and phone number.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.issueToken({
        facilityId: selectedFacilityId,
        department: selectedDepartment,
        patientName,
        patientPhone
      });
      // Redirect to token status tracking page
      navigate(`/token/${response.token._id}`);
    } catch (err) {
      setError(err.message || 'Failed to issue token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRedirect = (altFacilityId) => {
    setSelectedFacilityId(altFacilityId);
    const altFac = facilities.find(f => f._id === altFacilityId);
    if (altFac) {
      setDepartments(altFac.departments || []);
      setSelectedDepartment(selectedDepartment); // Keep the same department
    }
    setRedirectSuggestions([]);
  };

  return (
    <div className="w-full py-4 space-y-12">
      {/* Brand Hero Heading */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <span className="font-mono text-xs uppercase tracking-widest text-mute block">Live OPD Token Issuance</span>
        <h1 className="font-sans font-semibold text-4xl md:text-5xl text-ink tracking-tighter leading-none">
          Get your OPD token.
        </h1>
        <p className="text-body text-base">
          Skip the long physical queues. Generate a dynamic digital token, see live estimated wait times, and get redirected to nearby PHCs if wait times are high.
        </p>
      </div>

      {error && (
        <div className="bg-error-soft border border-error/20 text-error-deep p-4 rounded-md text-sm max-w-4xl mx-auto flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Two Column Grid utilizing full 1400px width */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Token Form - takes 7 columns */}
        <div className="lg:col-span-7 bg-canvas border border-hairline p-8 rounded-lg shadow-level-3">
          <h2 className="font-sans font-semibold text-xl tracking-tight text-ink mb-6">Patient Registration</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-body uppercase tracking-wider mb-2">Patient Full Name</label>
              <input
                type="text"
                placeholder="Enter full name"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full bg-canvas text-ink border border-hairline px-4 rounded-sm text-sm h-10 outline-none focus:border-hairline-strong transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-body uppercase tracking-wider mb-2">Mobile Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. +91 9876543210"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                className="w-full bg-canvas text-ink border border-hairline px-4 rounded-sm text-sm h-10 outline-none focus:border-hairline-strong transition"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Custom Styled Dropdowns */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-mono text-body uppercase tracking-wider">Select Facility</label>
                  {userLocation && (
                    <span className="text-[10px] font-mono text-link flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-link animate-pulse" />
                      Proximity Sorted
                    </span>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={selectedFacilityId}
                    onChange={handleFacilityChange}
                    className="w-full bg-canvas text-ink border border-hairline pl-4 pr-10 rounded-sm text-sm h-10 outline-none focus:border-hairline-strong transition appearance-none cursor-pointer"
                  >
                    {facilities.map(f => (
                      <option key={f._id} value={f._id}>
                        {f.name} ({f.type === 'district_hospital' ? 'Hospital' : 'PHC'}){f.distance !== undefined ? ` [${f.distance} km]` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-mute absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-body uppercase tracking-wider mb-2">Select Department</label>
                <div className="relative">
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full bg-canvas text-ink border border-hairline pl-4 pr-10 rounded-sm text-sm h-10 outline-none focus:border-hairline-strong transition appearance-none cursor-pointer"
                  >
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-mute absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-ink text-on-primary font-sans font-medium text-sm h-12 rounded-full cursor-pointer transition shadow-level-2 mt-4 flex items-center justify-center gap-2"
            >
              {loading ? 'Issuing Token...' : 'Get Token Now'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Live Wait Time & Redirect Side Panel - takes 5 columns */}
        <div className="lg:col-span-5 space-y-6">
          {/* Estimated Wait Card */}
          <div className="bg-canvas border border-hairline p-8 rounded-lg shadow-level-2 flex flex-col justify-between">
            <div>
              <span className="font-mono text-xs text-mute uppercase tracking-widest block mb-1">Queue Preview</span>
              <h3 className="font-sans font-semibold text-lg text-ink tracking-tight mb-4">Current Department Status</h3>
              
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-semibold tracking-tighter text-ink">
                  {waitEstimate !== null ? `${waitEstimate}` : '--'}
                </span>
                <span className="text-body text-sm">minutes wait</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-body mb-4">
                <Clock className="w-4 h-4 text-mute" />
                <span>Estimate based on current OPD consultation pace</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-hairline">
              {waitEstimate >= 45 ? (
                <div className="flex gap-2 text-warning-deep text-xs bg-warning-soft/30 border border-warning/10 p-3.5 rounded-md">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>High waiting time. We recommend redirecting to a nearby facility below.</span>
                </div>
              ) : (
                <div className="flex gap-2 text-link text-xs bg-link-bg-soft/20 border border-link/10 p-3.5 rounded-md">
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Normal waiting time. You can proceed with this booking.</span>
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Redirect Card */}
          {redirectSuggestions.length > 0 && (
            <div className="bg-canvas border border-warning/20 p-8 rounded-lg shadow-level-3 relative overflow-hidden">
              {/* Highlight strip for load balancer */}
              <div className="absolute top-0 left-0 w-full h-1 bg-warning" />
              
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-warning-deep animate-bounce" />
                <span className="font-mono text-xs text-warning-deep uppercase tracking-widest block">Load Balancer Suggestions</span>
              </div>
              <h3 className="font-sans font-semibold text-lg text-ink tracking-tight mb-4">Underutilized Nearby PHCs</h3>

              <div className="space-y-4">
                {redirectSuggestions.map((suggestion) => (
                  <div 
                    key={suggestion.facilityId} 
                    className="border border-hairline rounded-md p-4 bg-canvas-soft hover:bg-canvas-soft-2 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <span className="text-sm font-semibold text-ink leading-tight">{suggestion.name}</span>
                        <span className="text-xs bg-link-bg-soft text-link font-mono px-2 py-0.5 rounded-full flex-shrink-0">
                          {suggestion.distanceKm} km
                        </span>
                      </div>
                      <p className="text-xs text-mute mb-3">Type: {suggestion.type === 'PHC' ? 'Primary Health Centre' : 'Hospital'}</p>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-hairline/50">
                      <div className="flex items-center gap-1.5 text-xs text-link font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Wait time: ~{suggestion.avgWaitMinutes} mins</span>
                      </div>
                      <button
                        onClick={() => handleApplyRedirect(suggestion.facilityId)}
                        className="text-xs font-semibold text-ink bg-canvas border border-hairline hover:border-hairline-strong px-3 py-1.5 rounded-full transition flex items-center gap-1 cursor-pointer shadow-sm hover:shadow"
                      >
                        Choose
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
