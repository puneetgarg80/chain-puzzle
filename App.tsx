
import React from 'react';
import { ChainPuzzle } from './components/ChainPuzzle';
import { Chain } from './components/Chain';

function App() {
  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center font-sans">
      <main className="w-full h-screen flex flex-col">
        <Chain />
      </main>
    </div>
  );
}

export default App;
