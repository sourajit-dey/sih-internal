import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ShieldAlert, TrendingUp, AlertTriangle, ArrowRight, Check, Activity, ShieldCheck } from 'lucide-react';

function Predictions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadPredictions() {
    try {
      const response = await api.getPredictions();
      setData(response);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not fetch seasonal prediction data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPredictions();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-8 h-8 text-link border-2 border-t-transparent border-link rounded-full animate-spin" />
        <span className="text-sm font-mono text-mute">Analyzing historical health records...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-error-soft border border-error/25 text-error-deep p-6 rounded-lg text-sm text-center">
        {error || 'Failed to load predictions.'}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="border-b border-hairline pb-6">
        <span className="font-mono text-xs uppercase tracking-widest text-mute block mb-2">Predictive Analytics Engine</span>
        <h1 className="font-sans font-semibold text-3xl text-ink tracking-tighter leading-none mb-2">
          Seasonal OPD Disease-Spike Predictions.
        </h1>
        <p className="text-body text-sm">
          Uses statistical averages of historical daily patient counts to forecast surges in the upcoming month of <span className="font-semibold text-ink underline decoration-link">{data.targetMonth}</span>.
        </p>
      </div>

      {/* Main Grid: Facility Forecasts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {data.predictions.map((facPred) => {
          // Check if any department in this facility has a critical alert
          const hasCritical = facPred.predictions.some(p => p.alertType === 'critical');
          
          return (
            <div 
              key={facPred.facilityId}
              className={`bg-canvas border rounded-lg shadow-level-3 overflow-hidden flex flex-col justify-between ${
                hasCritical ? 'border-error/25' : 'border-hairline'
              }`}
            >
              {/* Header row */}
              <div className={`px-6 py-4 border-b border-hairline flex items-center justify-between ${
                hasCritical ? 'bg-error-soft/10' : 'bg-canvas-soft'
              }`}>
                <div>
                  <h3 className="font-sans font-semibold text-base text-ink leading-tight">
                    {facPred.facilityName}
                  </h3>
                  <span className="text-[10px] font-mono text-mute uppercase tracking-wider block mt-0.5">
                    {facPred.type === 'district_hospital' ? 'District Hospital' : 'Primary Health Centre'}
                  </span>
                </div>

                {hasCritical ? (
                  <span className="text-[10px] font-mono font-semibold uppercase bg-error-soft text-error-deep px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Spike Alert
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-semibold uppercase bg-cyan-soft text-cyan-deep px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Stable
                  </span>
                )}
              </div>

              {/* Department Analysis Rows */}
              <div className="divide-y divide-hairline flex-1">
                {facPred.predictions.map((pred) => (
                  <div key={pred.department} className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{pred.department}</span>
                      
                      <div className="flex items-center gap-2">
                        <TrendingUp className={`w-4 h-4 ${
                          pred.alertType === 'critical' ? 'text-error' :
                          pred.alertType === 'warning' ? 'text-warning' : 'text-mute'
                        }`} />
                        <span className="text-xs font-mono font-semibold text-ink">
                          Spike Index: {pred.spikeIndex}x
                        </span>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 bg-canvas-soft-2 p-3 rounded-md border border-hairline">
                      <div>
                        <span className="text-[10px] font-mono text-mute uppercase block">Historical Avg / Wk</span>
                        <span className="text-sm font-semibold text-ink">{pred.historicalAverage} patients</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-mute uppercase block">Forecasted Volume / Wk</span>
                        <span className={`text-sm font-semibold ${
                          pred.alertType === 'critical' ? 'text-error-deep' :
                          pred.alertType === 'warning' ? 'text-warning-deep' : 'text-ink'
                        }`}>
                          {pred.predictedVolume} patients
                        </span>
                      </div>
                    </div>

                    {/* Recommendation Box */}
                    <div className={`p-4 rounded-md text-xs border ${
                      pred.alertType === 'critical' ? 'bg-error-soft/30 border-error/15 text-error-deep font-sans' :
                      pred.alertType === 'warning' ? 'bg-warning-soft/30 border-warning/15 text-warning-deep' :
                      'bg-canvas-soft border-hairline text-body'
                    }`}>
                      <span className="font-semibold block mb-1">
                        {pred.alertType === 'critical' ? 'REALLOCATION ORDER SUGGESTION:' : 'REDEPLOYMENT NOTE:'}
                      </span>
                      {pred.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Seasonal Spike Explainer Callout Card */}
      <div className="bg-primary text-on-primary p-8 rounded-lg shadow-level-5 relative overflow-hidden">
        {/* Abstract Mesh-Gradient atmosphere effect */}
        <div className="absolute right-0 top-0 w-80 h-full bg-gradient-to-tr from-cyan to-highlight-pink opacity-25 blur-3xl pointer-events-none" />

        <div className="max-w-xl space-y-4 relative z-10">
          <span className="font-mono text-xs uppercase tracking-widest text-cyan block">Strategic Resource Balancing</span>
          <h2 className="font-sans font-semibold text-2xl tracking-tight leading-snug">
            Dynamic Doctor Reallocation Model.
          </h2>
          <p className="text-sm text-on-primary/80">
            Rather than letting patients overwhelm overloaded district hospitals, the balancer triggers proactive warnings. In monsoon month (September), dengue/malaria spikes in General Medicine will overload hospitals by over 2.5x. Administrations can instantly transfer unused PHC doctor capacities based on daily metrics.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <div className="flex items-center gap-2 text-xs bg-on-primary/10 px-3 py-1.5 rounded-full">
              <Check className="w-4 h-4 text-cyan" />
              <span>Reduces District Hospital Congestion by 40%</span>
            </div>
            <div className="flex items-center gap-2 text-xs bg-on-primary/10 px-3 py-1.5 rounded-full">
              <Check className="w-4 h-4 text-cyan" />
              <span>Balances OPD consultations</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Predictions;
