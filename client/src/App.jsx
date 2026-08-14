import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import TokenStatus from './pages/TokenStatus';
import AdminDashboard from './pages/AdminDashboard';
import Predictions from './pages/Predictions';
import { Activity } from 'lucide-react';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-canvas-soft text-ink flex flex-col font-sans">
        {/* Sticky Nav Bar */}
        <header className="sticky top-0 z-50 bg-canvas/80 backdrop-blur-md border-b border-hairline h-16 flex items-center justify-between px-6 md:px-12 shadow-level-1">
          <Link to="/" className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-link animate-pulse" />
            <span className="font-sans font-semibold text-lg tracking-tight">
              Queue<span className="text-mute font-normal">Balancer.</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link 
              to="/" 
              className="text-body hover:text-ink text-sm px-4 py-2 rounded-full transition duration-150 hover:bg-canvas-soft-2"
            >
              Get Token
            </Link>
            <Link 
              to="/admin" 
              className="text-body hover:text-ink text-sm px-4 py-2 rounded-full transition duration-150 hover:bg-canvas-soft-2"
            >
              Admin Dashboard
            </Link>
            <Link 
              to="/admin/predictions" 
              className="text-body hover:text-ink text-sm px-4 py-2 rounded-full transition duration-150 hover:bg-canvas-soft-2"
            >
              Predictions
            </Link>
          </nav>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 md:px-12 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/token/:id" element={<TokenStatus />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/predictions" element={<Predictions />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-canvas border-t border-hairline py-8 mt-12 text-center text-xs text-mute font-mono">
          <p className="uppercase tracking-widest mb-2">Smart India Hackathon 2026</p>
          <p>© {new Date().getFullYear()} Smart Hospital Queue Balancer. Underutilized PHC Routing Engine.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
