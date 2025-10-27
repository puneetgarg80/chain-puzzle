
import React from 'react';
import { ChainPuzzle } from './components/ChainPuzzle';
import { Chain } from './components/Chain';

function App() {
  const appStyles: React.CSSProperties = {
    backgroundColor: '#111827',
    color: 'white',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
  };

  const mainStyles: React.CSSProperties = {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={appStyles}>
      <main style={mainStyles}>
        <Chain />
      </main>
    </div>
  );
}

export default App;