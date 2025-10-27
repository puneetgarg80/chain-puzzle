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
  const chainsRef = useRef<Matter.Composite[]>([]);

  const handleCollision = useCallback((event: Matter.IEventCollision<Matter.Engine>) => {
    if (!engineRef.current) return;
    const world = engineRef.current.world;
    const pairs = event.pairs;
    const { Constraint, Composite, World } = MatterJS;

    console.log(`Collision event fired with ${pairs.length} pairs.`);

    for (const pair of pairs) {
      const { bodyA, bodyB } = pair;
      console.log(`Checking pair: bodyA (id: ${bodyA.id}, parent: ${bodyA.parent.id}), bodyB (id: ${bodyB.id}, parent: ${bodyB.parent.id})`);

      // 1. Check if both are chain links from different parent composites
      if (bodyA.label !== 'chainLink' || bodyB.label !== 'chainLink' || bodyA.parent === bodyB.parent) {
        if (bodyA.parent === bodyB.parent) {
            console.log('-> Skipping: Bodies belong to the same chain.');
        } else {
            console.log('-> Skipping: One or both bodies are not a "chainLink".');
        }
        continue;
      }
      
      const compositeA = bodyA.parent as unknown as Matter.Composite;
      const compositeB = bodyB.parent as unknown as Matter.Composite;

      // This can happen if one composite was just merged in the same tick
      if (!compositeA.bodies || !compositeB.bodies) {
        console.log('-> Skipping: One of the composites is empty (already merged).');
        continue;
      }

      // 2. Check if they are "end links" (have at most one existing constraint)
      const allConstraints = Composite.allConstraints(world);
      const bodyAConstraints = allConstraints.filter(c => c.bodyA === bodyA || c.bodyB === bodyA);
      const bodyBConstraints = allConstraints.filter(c => c.bodyA === bodyB || c.bodyB === bodyB);
      console.log(`  - Body A (id: ${bodyA.id}) has ${bodyAConstraints.length} constraints.`);
      console.log(`  - Body B (id: ${bodyB.id}) has ${bodyBConstraints.length} constraints.`);


      // A link in the middle of a chain has 2 constraints. An end link has 1.
      // We only want to join links that are at the end of their respective chains.
      if (bodyAConstraints.length >= 2 || bodyBConstraints.length >= 2) {
        console.log('-> Skipping: One or both bodies are not end links.');
        continue;
      }
      
      console.log('%c✅ Conditions met! Creating new constraint and merging chains.', 'color: #6EE7B7; font-weight: bold;');

      // 3. Create a new constraint to join them
      const newConstraint = Constraint.create({
        bodyA,
        bodyB,
        stiffness: 0.8,
        length: 10, // A short length to pull them together
        render: {
          type: 'line',
          strokeStyle: '#6EE7B7', // A bright green for new connections
          lineWidth: 2,
        },
      });
      World.add(world, newConstraint);

      // 4. Merge the composites to prevent re-joining attempts between the same two chains
      console.log(`Merging composite ${compositeB.id} into ${compositeA.id}`);
      const bodiesToMove = [...compositeB.bodies];
      bodiesToMove.forEach(body => {
        Composite.remove(compositeB, body);
        Composite.add(compositeA, body);
      });

      const constraintsToMove = [...compositeB.constraints];
      constraintsToMove.forEach(constraint => {
        Composite.remove(compositeB, constraint);
        Composite.add(compositeA, constraint);
      });

      // 5. Remove the now-empty composite B from the world and our ref array
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
    const createChain = (x: number, y: number, columns: number, rows: number, columnGap: number, rowGap: number, isVertical: boolean) => {
        const group = Body.nextGroup(true);
        const linkWidth = isVertical ? 20 : 50;
        const linkHeight = isVertical ? 50 : 20;

        const chain = Composites.stack(x, y, columns, rows, columnGap, rowGap, (ix, iy) => {
            return Bodies.rectangle(ix, iy, linkWidth, linkHeight, { 
                chamfer: { radius: 10 },
                collisionFilter: { group: group },
                frictionAir: 0.1,
                render: {
                    fillStyle: '#60A5FA',
                    strokeStyle: '#2563EB',
                    lineWidth: 2
                },
                label: 'chainLink'
            });
        });

        Composites.chain(chain, isVertical ? 0 : 0.5, isVertical ? 0.5 : 0, isVertical ? 0 : -0.5, isVertical ? -0.5 : 0, { stiffness: 0.8, length: 1, render: { type: 'line', strokeStyle: '#BFDBFE' } });
        
        return chain;
    };

    const { width, height } = render.options;
    const centerX = width! / 2;
    const centerY = height! / 2;
    const rectWidth = 400;
    const rectHeight = 300;

    const linkCount = 3;
    const linkSizeHorizontal = { w: 50, h: 20 };
    const linkSizeVertical = { w: 20, h: 50 };
    const gap = 10;

    const horizontalChainLength = linkCount * linkSizeHorizontal.w + (linkCount - 1) * gap;
    const verticalChainLength = linkCount * linkSizeVertical.h + (linkCount - 1) * gap;

    const topChain = createChain(centerX - (horizontalChainLength / 2), centerY - (rectHeight / 2), linkCount, 1, gap, gap, false);
    const bottomChain = createChain(centerX - (horizontalChainLength / 2), centerY + (rectHeight / 2), linkCount, 1, gap, gap, false);
    const leftChain = createChain(centerX - (rectWidth / 2) - linkSizeVertical.w, centerY - (verticalChainLength / 2), 1, linkCount, gap, gap, true);
    const rightChain = createChain(centerX + (rectWidth / 2), centerY - (verticalChainLength / 2), 1, linkCount, gap, gap, true);

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
