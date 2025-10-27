import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import type Matter from 'matter-js';

// --- Type Declarations (from types.ts) ---
declare global {
  interface Window {
    Matter: typeof Matter;
  }
}

// To satisfy TypeScript since Matter is loaded from CDN.
const MatterJS = window.Matter;

// --- Chain Component (from components/Chain.tsx) ---
const Chain: React.FC = () => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  const [instruction, setInstruction] = useState('Drag the chains together to connect them.');
  
  // Use a ref to store all chains to easily access them in event handlers
  const chainsRef = useRef<Matter.Body[]>([]);

  const handleCollision = useCallback((event: Matter.IEventCollision<Matter.Engine>) => {
    if (!engineRef.current) return;
    const world = engineRef.current.world;
    const pairs = event.pairs;
    const { Constraint, Composite, World } = MatterJS;

    console.log(`Collision event fired with ${pairs.length} pairs.`);

    for (const pair of pairs) {
      const { bodyA, bodyB } = pair;
      console.log(`Checking pair: bodyA (id: ${bodyA.id}), bodyB (id: ${bodyB.id})`);

      // 1. Check if both bodies are labeled as chain links.
      if (bodyA.label !== 'chainLink' || bodyB.label !== 'chainLink') {
          console.log('-> Skipping: One or both bodies are not a "chainLink".');
          continue;
      }

      // 2. Find the parent composite for each body by searching through our tracked chains.
      // This is necessary because body.parent does not point to the composite container.
      const findParentComposite = (body: Matter.Body) => 
          chainsRef.current.find(c =>  c.parts.some(b => b.id === body.id));

      const compositeA = findParentComposite(bodyA);
      const compositeB = findParentComposite(bodyB);

      // 3. Validate that composites were found and are different.
      if (!compositeA || !compositeB) {
          console.log('-> Skipping: Could not find a parent composite for one or both bodies.');
          continue;
      }
      
      console.log(`  - Body A belongs to composite ${compositeA.id}`);
      console.log(`  - Body B belongs to composite ${compositeB.id}`);

      if (compositeA.id === compositeB.id) {
          console.log('-> Skipping: Bodies belong to the same chain.');
          continue;
      }

      // This can happen if one composite was just merged in the same tick
      if (!compositeA.parts || !compositeB.parts) {
        console.log('-> Skipping: One of the composites is empty (already merged).');
        continue;
      }

      // 4. Check if they are "end links" (have at most one existing constraint)
      const allConstraints = Composite.allConstraints(world);
      const bodyAConstraints = allConstraints.filter(c => (c.bodyA === bodyA || c.bodyB === bodyA) && c.label !== 'Mouse Constraint');
      const bodyBConstraints = allConstraints.filter(c => (c.bodyA === bodyB || c.bodyB === bodyB) && c.label !== 'Mouse Constraint');
      console.log(`  - Body A (id: ${bodyA.id}) has ${bodyAConstraints.length} chain constraints.`);
      console.log(`  - Body B (id: ${bodyB.id}) has ${bodyBConstraints.length} chain constraints.`);


      // A link in the middle of a chain has 2 constraints. An end link has 1.
      // We only want to join links that are at the end of their respective chains.
      if (bodyAConstraints.length >= 2 || bodyBConstraints.length >= 2) {
        console.log('-> Skipping: One or both bodies are not end links.');
        continue;
      }
      
      console.log('%c✅ Conditions met! Creating new constraint and merging chains.', 'color: #6EE7B7; font-weight: bold;');

      // 5. Merge the composites to prevent re-joining attempts between the same two chains
      console.log(`Merging composite ${compositeB.id} into ${compositeA.id}`);
      // 1. Get component parts from source (excluding parent at index 0)
      const partsToTransfer = compositeB.parts.slice(1);

      // 2. Build the new parts array for the target body
      let newTargetParts = [compositeA];                     // Start with the new parent
      newTargetParts.push(...compositeA.parts.slice(1));    // Add target's existing parts
      newTargetParts.push(...partsToTransfer);              // Add source's parts

      // 3. Apply the new parts to the target body
      MatterJS.Body.setParts(compositeB, [compositeB]);
      MatterJS.Body.setParts(compositeA, newTargetParts);

      // 4. Remove the now-empty composite B from the world and our ref array
      World.remove(world, compositeB);
      const oldChainCount = chainsRef.current.length;
      chainsRef.current = chainsRef.current.filter(c => c.id !== compositeB.id);
      console.log(`Removed composite ${compositeB.id}. Chain count: ${oldChainCount} -> ${chainsRef.current.length}`);
      
      setInstruction('Nice! Keep connecting to form one single chain.');

      // Since we modified the composites, we should break this loop to avoid stale references in this tick
      console.log('Breaking loop after successful merge.');
      break;
    }
  }, []);
    
  useEffect(() => {
    if (!sceneRef.current) return;

    const { Engine, Render, Runner, Composite, Composites, Constraint, World, Bodies, Body, Mouse, MouseConstraint, Events } = MatterJS;
    
    const engine = Engine.create();
    engineRef.current = engine;
    
    const render = Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: sceneRef.current.clientWidth,
        height: sceneRef.current.clientHeight,
        wireframes: false,
        background: '#111827',
      },
    });
    renderRef.current = render;

    const runner = Runner.create();
    runnerRef.current = runner;
    Runner.run(runner, engine);

    const world = engine.world;
    world.gravity.y = 0;

    // Add boundaries
    World.add(world, [
      Bodies.rectangle(render.options.width! / 2, -25, render.options.width!, 50, { isStatic: true, render: {fillStyle: '#4B5563'} }),
      Bodies.rectangle(render.options.width! / 2, render.options.height! + 25, render.options.width!, 50, { isStatic: true, render: {fillStyle: '#4B5563'} }),
      Bodies.rectangle(render.options.width! + 25, render.options.height! / 2, 50, render.options.height!, { isStatic: true, render: {fillStyle: '#4B5563'} }),
      Bodies.rectangle(-25, render.options.height! / 2, 50, render.options.height!, { isStatic: true, render: {fillStyle: '#4B5563'} }),
    ]);

    // Helper function to create a chain
    const createChain = (x: number, y: number, count: number, isVertical: boolean) => {
        const group = Body.nextGroup(true);
        const linkWidth = isVertical ? 20 : 50;
        const linkHeight = isVertical ? 50 : 20;
        const xIncrement = isVertical ? 0 : linkWidth;
        const yIncrement = isVertical ? linkHeight : 0;

        const chain = MatterJS.Body.create({
          parts: Array.from({length: count}, (_, index) => {
            return Bodies.rectangle(x + (index * xIncrement), y + (index * yIncrement), linkWidth, linkHeight, { 
                chamfer: { radius: 10 },
                collisionFilter: { group: group },
                render: {
                    fillStyle: '#60A5FA',
                    strokeStyle: '#2563EB',
                    lineWidth: 2
                },
                label: 'chainLink'
            });
          }),
          isStatic: false,
        });        
        return chain;
    };
    
    const { width, height } = render.options;
    const centerX = width! / 2;
    const centerY = height! / 2;

    const linkCount = 3;
    const linkSizeHorizontal = { w: 50, h: 20 };
    const linkSizeVertical = { w: 20, h: 50 };
    const gap = 0;

    const horizontalChainLength = linkCount * linkSizeHorizontal.w + (linkCount - 1) * gap;
    const verticalChainLength = linkCount * linkSizeVertical.h + (linkCount - 1) * gap;
    const rectWidth = horizontalChainLength + 80;
    const rectHeight = verticalChainLength + 80;
    
    const topChain = createChain(centerX - (horizontalChainLength / 2), centerY - (rectHeight / 2), linkCount, false);
    const bottomChain = createChain(centerX - (horizontalChainLength / 2), centerY + (rectHeight / 2), linkCount, false);
    const leftChain = createChain(centerX - (rectWidth / 2), centerY - (verticalChainLength / 2), linkCount, true);
    const rightChain = createChain(centerX + (rectWidth / 2), centerY - (verticalChainLength / 2), linkCount, true);


    console.log("CentreX, CentreY", centerX, centerY);
    console.log("horizontalChainLength, verticalChainLength", horizontalChainLength, verticalChainLength);
    console.log("Top chain initial coordinates (start):", centerX - (horizontalChainLength / 2), centerY - (rectHeight / 2));
    console.log("Bottom chain initial coordinates (start):", centerX - (horizontalChainLength / 2), centerY + (rectHeight / 2));
    console.log("Left chain initial coordinates (start):", centerX - (rectWidth / 2), centerY - (verticalChainLength / 2));
    console.log("Right chain initial coordinates (start):", centerX + (rectWidth / 2), centerY - (verticalChainLength / 2));

    const allChains = [topChain, bottomChain, leftChain, rightChain];
    chainsRef.current = allChains;

    World.add(world, allChains);

    // Add mouse control
    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.2,
        render: {
          visible: false,
        },
      },
    });

    World.add(world, mouseConstraint);
    render.mouse = mouse;

    Events.on(engine, 'collisionStart', handleCollision);

    Render.run(render);

    const handleResize = () => {
        if (!renderRef.current || !sceneRef.current) return;
        renderRef.current.canvas.width = sceneRef.current.clientWidth;
        renderRef.current.canvas.height = sceneRef.current.clientHeight;
        renderRef.current.options.width = sceneRef.current.clientWidth;
        renderRef.current.options.height = sceneRef.current.clientHeight;
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      if (engineRef.current) {
        Events.off(engineRef.current, 'collisionStart', handleCollision);
      }
      Runner.stop(runnerRef.current!);
      World.clear(engineRef.current!.world, false);
      Engine.clear(engineRef.current!);
      Render.stop(renderRef.current!);
      renderRef.current!.canvas.remove();
      renderRef.current!.textures = {};
      window.removeEventListener('resize', handleResize);
    };
  }, [handleCollision]);

  const containerStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  };

  const overlayStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    textAlign: 'center',
    zIndex: 10
  };

  const titleStyles: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#93C5FD'
  };

  const instructionStyles: React.CSSProperties = {
    fontSize: '1rem',
    color: '#D1D5DB',
    marginTop: '4px'
  };

  const sceneStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    flexGrow: 1
  };

  return (
    <div style={containerStyles}>
        <div style={overlayStyles}>
            <h1 style={titleStyles}>Chain Puzzle</h1>
            <p style={instructionStyles}>{instruction}</p>
        </div>
        <div ref={sceneRef} style={sceneStyles} />
    </div>
  );
};


// --- App Component (from App.tsx) ---
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


// --- Root Rendering (original index.tsx) ---
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);