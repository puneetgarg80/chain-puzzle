import React, { useRef, useEffect, useState, useCallback } from 'react';
// FIX: Import Matter.js types to resolve namespace errors and remove unused imports.
// import type Matter from 'matter-js';

// To satisfy TypeScript since Matter is loaded from CDN
const Matter = window.Matter;

export const Chain: React.FC = () => {
  const sceneRef = useRef<HTMLDivElement>(null);
  // FIX: Initialize useRef with null for mutable refs and update types to allow null.
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  const [instruction, setInstruction] = useState('Click on a chain link to open it.');
  
  // Use a ref to store all chains to easily access them in event handlers
  const chainsRef = useRef<Matter.Composite[]>([]);
    
  useEffect(() => {
    if (!sceneRef.current) return;

    const { Engine, Render, Runner, Composite, Composites, Constraint, World, Bodies, Mouse, MouseConstraint, Events } = Matter;
    
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

    // Create a chain
    const group = 1;
    const chain = Composites.stack(render.options.width! / 2 - 200, 100, 3, 1, 10, 10, (x, y) => {
      return Bodies.rectangle(x, y, 50, 20, { 
        chamfer: { radius: 10 },
        collisionFilter: { group: group },
        render: {
            fillStyle: '#60A5FA',
            strokeStyle: '#2563EB',
            lineWidth: 2
        }
    });
    });
    
    Composites.chain(chain, 0.5, 0, -0.5, 0, { stiffness: 0.8, length: 1, render: { type: 'line', strokeStyle: '#BFDBFE' } });
    
    chainsRef.current = [chain];
    
    World.add(world, [
      chain
    ]);

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
      Runner.stop(runnerRef.current!);
      World.clear(engineRef.current!.world, false);
      Engine.clear(engineRef.current!);
      Render.stop(renderRef.current!);
      renderRef.current!.canvas.remove();
      renderRef.current!.textures = {};
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col relative">
        <div className="absolute top-0 left-0 right-0 p-4 bg-black bg-opacity-30 text-center z-10">
            <h1 className="text-xl md:text-2xl font-bold text-blue-300">Chain Puzzle</h1>
            <p className="text-sm md:text-base text-gray-300 mt-1">{instruction}</p>
        </div>
        <div ref={sceneRef} className="w-full h-full flex-grow" />
    </div>
  );
};