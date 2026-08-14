import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { Clock, Users, ShieldAlert, CheckCircle2, ArrowRight, CornerUpRight, RefreshCw } from 'lucide-react';

function TokenStatus() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redirects, setRedirects] = useState([]);
  const [redirecting, setRedirecting] = useState(false);

  async function loadTokenStatus() {
    try {
      const response = await api.getTokenStatus(id);
      setData(response);
      setRedirects(response.redirectSuggestions || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not fetch token status.');
    } finally {
      setLoading(false);
    }
  }

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    loadTokenStatus();
  }, [id]);

  // Connect to Socket.io and listen for live updates
  useEffect(() => {
    if (!id) return;

    // Join room for this token
    socket.emit('join:token', { tokenId: id });

    // Listen for live token status updates
    socket.on('token:update', (updatedFields) => {
      console.log('Received live token update:', updatedFields);
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          token: {
            ...prev.token,
            status: updatedFields.status,
            estimatedTime: updatedFields.estimatedTime
          },
          position: updatedFields.position !== undefined ? updatedFields.position : prev.position,
          waitMinutes: updatedFields.position !== undefined ? (updatedFields.position * (prev.token?.doctorId?.avgConsultMinutes || 10)) : prev.waitMinutes
        };
      });
    });

    // Listen for live redirect suggestions
    socket.on('redirect:suggested', (suggestions) => {
      console.log('Received live redirect suggestions:', suggestions);
      setRedirects(suggestions);
    });

    return () => {
      socket.emit('leave:token', { tokenId: id });
      socket.off('token:update');
      socket.off('redirect:suggested');
    };
  }, [id]);

  const handleAcceptRedirect = async (altFacilityId) => {
    if (!data?.token) return;
    setRedirecting(true);
    try {
      // 1. Mark current token as "redirected" (optional backend handles it by creating a new token or we can just issue a new token with status update)
      // For demo flow, we issue a brand new token at the alternative facility
      const res = await api.issueToken({
        facilityId: altFacilityId,
        department: data.token.department,
        patientName: data.token.patientId.name,
        patientPhone: data.token.patientId.phone
      });

      // Update current token state locally
      setData(prev => ({
        ...prev,
        token: {
          ...prev.token,
          status: 'redirected'
        }
      }));

      // Navigate to the new token status
      navigate(`/token/${res.token._id}`);
    } catch (err) {
      console.error(err);
      setError('Failed to apply redirect suggestion.');
    } finally {
      setRedirecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-8 h-8 text-link animate-spin" />
        <span className="text-sm font-mono text-mute">Loading token details...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <ShieldAlert className="w-12 h-12 text-error mx-auto mb-4" />
        <h2 className="text-xl font-sans font-semibold tracking-tight text-ink mb-2">Error</h2>
        <p className="text-sm text-body mb-6">{error || 'Token not found.'}</p>
        <button 
          onClick={() => navigate('/')}
          className="bg-primary text-on-primary font-sans font-medium text-sm px-6 py-2.5 rounded-full hover:bg-ink transition"
        >
          Go Home
        </button>
      </div>
    );
  }

  const { token, position, waitMinutes } = data;
  const estDate = token.estimatedTime ? new Date(token.estimatedTime) : null;
  const timeString = estDate ? estDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Page Header */}
      <div className="text-center mb-8">
        <span className="font-mono text-xs uppercase tracking-widest text-mute block mb-2">Token Tracking</span>
        <h1 className="font-sans font-semibold text-3xl text-ink tracking-tighter mb-2 leading-none">
          Live Token Status.
        </h1>
        <p className="text-body text-sm">
          Keep this page open. Estimates update automatically when the doctor advances the queue.
        </p>
      </div>

      {/* Main Token Display Card */}
      <div className="bg-canvas border border-hairline p-8 rounded-lg shadow-level-4 text-center mb-8 relative overflow-hidden">
        {/* Status indicator strip at top */}
        <div className={`absolute top-0 left-0 w-full h-1.5 ${
          token.status === 'waiting' ? 'bg-warning' :
          token.status === 'in_progress' ? 'bg-link animate-pulse' :
          token.status === 'done' ? 'bg-cyan-deep' : 'bg-mute'
        }`} />

        <div className="mb-6">
          <span className="text-xs font-mono text-mute uppercase tracking-widest block mb-1">
            {token.facilityId?.name} — {token.department}
          </span>
          <span className="text-xs bg-canvas-soft-2 border border-hairline text-body px-3 py-1 rounded-full font-mono">
            Doctor: {token.doctorId?.name}
          </span>
        </div>

        {/* Big Token Number */}
        <div className="mb-6">
          <span className="text-sm font-mono text-mute block mb-1">Your Token Number</span>
          <div className="text-7xl font-sans font-bold tracking-tighter text-ink leading-none mb-2">
            #{token.tokenNumber}
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            token.status === 'waiting' ? 'bg-warning-soft text-warning-deep' :
            token.status === 'in_progress' ? 'bg-link-bg-soft text-link' :
            token.status === 'done' ? 'bg-cyan-soft text-cyan-deep' : 'bg-canvas-soft-2 text-mute'
          }`}>
            {token.status === 'waiting' && 'In Waiting List'}
            {token.status === 'in_progress' && 'Currently Inside Consulting Room'}
            {token.status === 'done' && 'Consultation Complete'}
            {token.status === 'redirected' && 'Redirected to Another Center'}
          </span>
        </div>

        {token.status === 'waiting' && (
          <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-6 mt-6">
            <div className="border-r border-hairline">
              <div className="flex justify-center items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-mute" />
                <span className="text-2xl font-semibold tracking-tighter text-ink">{position}</span>
              </div>
              <span className="text-xs font-mono text-mute uppercase tracking-wider block">Position in Line</span>
            </div>

            <div>
              <div className="flex justify-center items-center gap-2 mb-1">
                <Clock className="w-5 h-5 text-mute" />
                <span className="text-2xl font-semibold tracking-tighter text-ink">{timeString}</span>
              </div>
              <span className="text-xs font-mono text-mute uppercase tracking-wider block">Est. Time (~{waitMinutes}m)</span>
            </div>
          </div>
        )}

        {token.status === 'in_progress' && (
          <div className="bg-link-bg-soft/20 border border-link/10 rounded-md p-4 mt-6 text-sm text-link-deep flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 animate-spin" />
            <span>It is your turn! Please step inside the doctor's consulting room now.</span>
          </div>
        )}

        {token.status === 'done' && (
          <div className="bg-cyan-soft/30 border border-cyan-deep/10 rounded-md p-4 mt-6 text-sm text-cyan-deep flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>Your appointment is complete. Thank you for using QueueBalancer!</span>
          </div>
        )}
      </div>

      {/* Live Redirect Suggestion Panel (Only if waiting & alternatives exist) */}
      {token.status === 'waiting' && redirects.length > 0 && (
        <div className="bg-canvas border border-warning/20 p-6 rounded-lg shadow-level-4">
          <div className="flex items-start gap-3 mb-4">
            <CornerUpRight className="w-5 h-5 text-warning-deep mt-0.5" />
            <div>
              <h3 className="font-sans font-semibold text-lg text-ink tracking-tight">
                Live Redirect Recommendation
              </h3>
              <p className="text-xs text-body">
                The current hospital is heavily congested. You can instantly reroute your appointment to a nearby Primary Health Centre (PHC) with zero wait times.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {redirects.map((alt) => (
              <div 
                key={alt.facilityId} 
                className="border border-hairline rounded-md p-4 bg-canvas-soft flex items-center justify-between"
              >
                <div>
                  <h4 className="text-sm font-semibold text-ink">{alt.name}</h4>
                  <div className="flex items-center gap-3 text-xs text-body mt-1">
                    <span className="font-mono">{alt.distanceKm} km away</span>
                    <span>•</span>
                    <span className="text-link font-medium">Wait time: ~{alt.avgWaitMinutes} mins</span>
                  </div>
                </div>

                <button
                  onClick={() => handleAcceptRedirect(alt.facilityId)}
                  disabled={redirecting}
                  className="bg-primary hover:bg-ink text-on-primary text-xs font-semibold px-4 py-2 rounded-full cursor-pointer transition flex items-center gap-1 shadow-sm"
                >
                  {redirecting ? 'Rerouting...' : 'Reroute Token'}
                  {!redirecting && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TokenStatus;
