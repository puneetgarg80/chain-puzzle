import React, { useRef, useEffect, useState, useCallback } from 'react';
// FIX: Import Matter.js types to resolve namespace errors.
import type Matter from 'matter-js';
import { GameState, OpenLinkInfo } from '../types';

// To satisfy TypeScript since Matter is loaded from CDN
const Matter = window.Matter;

export const ChainPuzzle: React.FC = () => {
  const sceneRef = useRef<HTMLDivDivElement>(null);
  // FIX: Initialize useRef with null for mutable refs and update types to allow null.
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [openLinkInfo, setOpenLinkInfo] = useState<OpenLinkInfo | null>(null);
  const [instruction, setInstruction] = useState('Click on a chain link to open it.');
  
  // Use a ref to store all chains to easily access them in event handlers
  const chainsRef = useRef<Matter.Composite[]>([]);
  
  const getBodyChain = useCallback((body: Matter.Body) => {
    return chainsRef.current.find(chain => chain.bodies.includes(body));
  }, []);
  
  const getChainEnds = useCallback(() => {
    const ends: Matter.Body[] = [];
    chainsRef.current.forEach(chain => {
      if (chain.bodies.length > 0) {
        ends.push(chain.bodies[0]);
        if (chain.bodies.length > 1) {
          ends.push(chain.bodies[chain.bodies.length - 1]);
        }
      }
    });
    return ends;
  }, []);
  
  const isChainEnd = useCallback((body: Matter.Body) => {
    return getChainEnds().includes(body);
  }, [getChainEnds]);

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
    const chain = Composites.stack(render.options.width! / 2 - 200, 100, 10, 1, 10, 10, (x, y) => {
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
    
    Composites.chain(chain, 0.5, 0, -0.5, 0, { stiffness: 0.8, length: 2, render: { type: 'line', strokeStyle: '#BFDBFE' } });
    
    chainsRef.current = [chain];
    
    World.add(world, [
      chain,
      Constraint.create({ 
          bodyB: chain.bodies[0],
          pointB: { x: -25, y: 0 },
          pointA: { x: chain.bodies[0].position.x, y: chain.bodies[0].position.y },
          stiffness: 0.5
      })
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

  const handleMouseDown = useCallback((e: MouseEvent) => {
      const { Query, World, Composite, Composites, Constraint } = Matter;
      if (!engineRef.current || !renderRef.current || !renderRef.current.mouse) return;

      const bodies = Composite.allBodies(engineRef.current.world);
      const mousePosition = renderRef.current.mouse.position;
      const clickedBodies = Query.point(bodies, mousePosition);

      if (clickedBodies.length === 0) return;
      const clickedBody = clickedBodies[0];
      
      switch (gameState) {
        case GameState.IDLE: {
          const bodyChain = getBodyChain(clickedBody);
          if (!bodyChain) return;

          const constraints = Composite.allConstraints(engineRef.current.world);
          const originalConstraints = constraints.filter(c => c.bodyA === clickedBody || c.bodyB === clickedBody);
          
          if (originalConstraints.length > 2) {
             console.warn("More than 2 constraints found on this link. This might be a fixed point.");
             return;
          }

          World.remove(engineRef.current.world, originalConstraints);

          // Split the chain
          const bodyIndex = bodyChain.bodies.indexOf(clickedBody);
          const chain1Bodies = bodyChain.bodies.slice(0, bodyIndex);
          const chain2Bodies = bodyChain.bodies.slice(bodyIndex + 1);

          const newChain1 = Composite.create({bodies: chain1Bodies});
          const newChain2 = Composite.create({bodies: chain2Bodies});

          // Re-add original constraints to rebuild chain composites
          Composites.chain(newChain1, 0.5, 0, -0.5, 0, { stiffness: 0.8, length: 2, render: { type: 'line', strokeStyle: '#BFDBFE' } });
          Composites.chain(newChain2, 0.5, 0, -0.5, 0, { stiffness: 0.8, length: 2, render: { type: 'line', strokeStyle: '#BFDBFE' } });

          const oldChainIndex = chainsRef.current.indexOf(bodyChain);
          chainsRef.current.splice(oldChainIndex, 1, newChain1, newChain2);
          chainsRef.current = chainsRef.current.filter(c => c.bodies.length > 0);

          clickedBody.render.fillStyle = '#FBBF24'; // Amber color for opened link
          setOpenLinkInfo({ body: clickedBody, originalConstraints, connectedEnds: [], newConstraints: [] });
          setGameState(GameState.LINK_OPENED);
          setInstruction('Link opened. Click a chain end to connect.');
          break;
        }

        case GameState.LINK_OPENED:
        case GameState.CONNECTING: {
            if (!openLinkInfo) return;

            // If user clicks the open link again, they might want to close it
            if (clickedBody === openLinkInfo.body) {
                if (openLinkInfo.newConstraints.length > 0) {
                    // Finalize connection
                    openLinkInfo.body.render.fillStyle = '#60A5FA';
                    openLinkInfo.newConstraints.forEach(c => c.render.strokeStyle = '#BFDBFE');
                    
                    // Re-form composite chains
                    const connectedChains: Matter.Composite[] = [];
                    const bodiesToGroup: Matter.Body[] = [openLinkInfo.body];
                    
                    openLinkInfo.connectedEnds.forEach(endBody => {
                       const chain = getBodyChain(endBody);
                       if (chain && !connectedChains.includes(chain)) {
                           connectedChains.push(chain);
                           if (chain.bodies[0] === endBody) {
                               bodiesToGroup.push(...chain.bodies.reverse());
                           } else {
                               bodiesToGroup.push(...chain.bodies);
                           }
                       }
                    });

                    const newChainComposite = Composite.create({bodies: bodiesToGroup});
                    Composites.chain(newChainComposite, 0.5, 0, -0.5, 0, { stiffness: 0.8, length: 2, render: { type: 'line', strokeStyle: '#BFDBFE' } });

                    const remainingChains = chainsRef.current.filter(c => !connectedChains.includes(c));
                    chainsRef.current = [...remainingChains, newChainComposite];
                    
                    setOpenLinkInfo(null);
                    setGameState(GameState.IDLE);
                    setInstruction('Connection closed. Click another link to open it.');
                } else {
                   // Cancel open
                    World.add(engineRef.current.world, openLinkInfo.originalConstraints);
                    openLinkInfo.body.render.fillStyle = '#60A5FA';
                    setOpenLinkInfo(null);
                    setGameState(GameState.IDLE);
                    setInstruction('Action cancelled. Click a link to open it.');
                }
            } else if (isChainEnd(clickedBody) && openLinkInfo.connectedEnds.length < 2 && !openLinkInfo.connectedEnds.includes(clickedBody)) {
                // Connect to a chain end
                const newConstraint = Constraint.create({
                    bodyA: openLinkInfo.body,
                    bodyB: clickedBody,
                    stiffness: 0.7,
                    length: 40,
                    render: {
                        strokeStyle: '#FBBF24',
                        lineWidth: 3
                    }
                });
                World.add(engineRef.current.world, newConstraint);
                setOpenLinkInfo(prev => prev ? ({
                    ...prev,
                    connectedEnds: [...prev.connectedEnds, clickedBody],
                    newConstraints: [...prev.newConstraints, newConstraint]
                }) : null);
                setGameState(GameState.CONNECTING);
                if (openLinkInfo.connectedEnds.length === 1) {
                    setInstruction('Connected one end. Click another end or click the yellow link to close.');
                } else {
                    setInstruction('Connected two ends. Click the yellow link to close the connection.');
                }
            }
          break;
        }
      }
  }, [gameState, openLinkInfo, isChainEnd, getBodyChain]);


  useEffect(() => {
    const canvas = renderRef.current?.canvas;
    if (canvas) {
      canvas.addEventListener('mousedown', handleMouseDown);
    }
    return () => {
      if (canvas) {
        canvas.removeEventListener('mousedown', handleMouseDown);
      }
    };
  }, [handleMouseDown]);


  const resetPuzzle = () => {
      // This is a "soft" reset. A hard reset would require re-running the initial useEffect.
      if (openLinkInfo && engineRef.current) {
        Matter.World.add(engineRef.current.world, openLinkInfo.originalConstraints);
        openLinkInfo.body.render.fillStyle = '#60A5FA';
        Matter.World.remove(engineRef.current.world, openLinkInfo.newConstraints);
      }
      // More complex reset logic to restore original chain would be needed for a full reset.
      // For now, this just cancels the current action.
      setGameState(GameState.IDLE);
      setOpenLinkInfo(null);
      setInstruction('Action cancelled. Click a link to open it.');
  }

  return (
    <div className="w-full h-full flex flex-col relative">
        <div className="absolute top-0 left-0 right-0 p-4 bg-black bg-opacity-30 text-center z-10">
            <h1 className="text-xl md:text-2xl font-bold text-blue-300">Matter.js Chain Puzzle</h1>
            <p className="text-sm md:text-base text-gray-300 mt-1">{instruction}</p>
        </div>
        <div ref={sceneRef} className="w-full h-full flex-grow" />
        <div className="absolute bottom-4 right-4 z-10">
           <button onClick={resetPuzzle} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-colors">
               Cancel Action
           </button>
        </div>
    </div>
  );
};