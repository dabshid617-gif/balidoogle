import React from 'react';

const NotFound: React.FC<{ onNavigate?: (p: 'home' | 'saved' | 'list' | 'profile' | 'product') => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background-light dark:bg-background-dark text-center px-6">
      <div className="text-6xl mb-4">??</div>
      <h1 className="text-3xl font-bold mb-2">Page not found</h1>
      <p className="text-slate-500 mb-6">The page you are looking for doesn't exist.</p>
      <button
        onClick={() => {
          if (onNavigate) onNavigate('home');
          else window.location.href = '/';
        }}
        className="px-6 py-3 rounded-xl bg-primary text-black font-semibold shadow-sm"
      >
        Back to home
      </button>
    </div>
  );
};

export default NotFound;
