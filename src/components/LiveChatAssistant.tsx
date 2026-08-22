import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Mic, X, Loader2, Sparkles, AlertTriangle, Headphones, User, Bot, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { pcmToBase64, playAudioChunk, resetAudioPlayback } from '../lib/audioUtils';

export interface LiveChatAssistantHandle {
  toggleMic: () => void;
}

const LiveChatAssistant = forwardRef<LiveChatAssistantHandle, any>(({ 
  speed, 
  rpm, 
  isRecording,
  onTabChange,
  onSetNavigation,
  onDiagnose,
  onToggleRecording,
  postCommandActions,
  isSimulation,
  onSetSimulation,
  userProfile,
  onShowSubscription,
  onDeductToken
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Real-time voice transcript logs
  const [liveTranscript, setLiveTranscript] = useState<{ id: string; sender: 'user' | 'ai'; text: string }[]>([]);
  const [activeSpeechState, setActiveSpeechState] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'thinking'>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const bgRecognitionRef = useRef<any>(null);

  // Sync refs to avoid stale closures in callbacks
  const postCommandActionsRef = useRef(postCommandActions);
  const isSimulationRef = useRef(isSimulation);
  const onTabChangeRef = useRef(onTabChange);
  const onSetNavigationRef = useRef(onSetNavigation);
  const onDiagnoseRef = useRef(onDiagnose);
  const onToggleRecordingRef = useRef(onToggleRecording);
  const onSetSimulationRef = useRef(onSetSimulation);

  useEffect(() => {
    postCommandActionsRef.current = postCommandActions;
    isSimulationRef.current = isSimulation;
    onTabChangeRef.current = onTabChange;
    onSetNavigationRef.current = onSetNavigation;
    onDiagnoseRef.current = onDiagnose;
    onToggleRecordingRef.current = onToggleRecording;
    onSetSimulationRef.current = onSetSimulation;
  }, [postCommandActions, isSimulation, onTabChange, onSetNavigation, onDiagnose, onToggleRecording, onSetSimulation]);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTranscript]);

  // Waveform visualization loop
  useEffect(() => {
    if (!isLive || !canvasRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phrase = 0;

    const renderWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;

      // Read volume level from active speech source analyser
      let volume = 0;
      if (activeSpeechState === 'speaking' && outputAnalyserRef.current) {
        const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
        outputAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length;
      } else if (activeSpeechState === 'listening' && inputAnalyserRef.current) {
        const dataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
        inputAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length;
      }

      // Compute visual parameters
      const normVolume = Math.min(1, volume / 96); // scale factor
      const amplitude = 6 + normVolume * (height / 2.5 - 6);
      const frequency = 0.04 + normVolume * 0.04;
      const speed = 0.08 + normVolume * 0.12;

      phrase += speed;

      // Solid styling with glowing shadow
      ctx.lineWidth = 2.5;

      let color = 'rgba(46, 204, 113, '; // neon green for speaking / default
      if (activeSpeechState === 'listening') {
        color = 'rgba(52, 152, 219, '; // bright cyan/blue for user microphone input
      } else if (activeSpeechState === 'thinking' || activeSpeechState === 'connecting') {
        color = 'rgba(230, 126, 34, '; // amber for processing
      } else if (activeSpeechState === 'idle') {
        color = 'rgba(127, 140, 141, '; // muted slate for silent state
      }

      // Draw 3 layers of smooth fluid sine waves
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        ctx.strokeStyle = color + (0.75 - layer * 0.22) + ')';
        ctx.shadowBlur = layer === 0 ? 8 : 0;
        ctx.shadowColor = color + '0.45)';

        for (let x = 0; x < width; x++) {
          // Sine wave modulated by a sine envelope to taper off smoothly at the borders
          const envelope = Math.sin(x * Math.PI / width);
          const y = height / 2 + Math.sin(x * frequency + phrase + layer * (Math.PI / 2.5)) * amplitude * envelope;
          
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      ctx.shadowBlur = 0; // reset shadow
      animationFrameRef.current = requestAnimationFrame(renderWave);
    };

    renderWave();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isLive, activeSpeechState]);

  const initialPromptRef = useRef<string | null>(null);

  // Start background listening on mount instead of Live API
  useEffect(() => {
    startContinuousListening();
    return () => {
      stopLive();
    };
  }, []);

  const processCommand = (command: string) => {
    if (command.includes('navigate to') || command.includes('set destination to') || command.includes('go to')) {
      const destination = command.replace(/.*(navigate to|set destination to|go to)\s+/g, '').trim();
      onTabChangeRef.current && onTabChangeRef.current('gps');
      onSetNavigationRef.current && onSetNavigationRef.current('Current Location', destination);
      if (postCommandActionsRef.current?.setNavigation === 'autoRecord') {
        onToggleRecordingRef.current && onToggleRecordingRef.current(true);
      }
    } else if (command.includes('diagnose') || command.includes('run diagnostics') || command.includes('check engine')) {
      onTabChangeRef.current && onTabChangeRef.current('obd');
      onDiagnoseRef.current && onDiagnoseRef.current();
    } else if (command.includes('start recording') || command.includes('record trip')) {
      onToggleRecordingRef.current && onToggleRecordingRef.current(true);
      if (postCommandActionsRef.current?.toggleRecording === 'switchGPS') {
        onTabChangeRef.current && onTabChangeRef.current('gps');
      }
    } else if (command.includes('stop recording')) {
      onToggleRecordingRef.current && onToggleRecordingRef.current(false);
    } else if (command.includes('show dashboard') || command.includes('switch to dashboard')) {
      onTabChangeRef.current && onTabChangeRef.current('dashboard');
    } else if (command.includes('show gps') || command.includes('switch to gps') || command.includes('show map')) {
      onTabChangeRef.current && onTabChangeRef.current('gps');
    } else if (command.includes('show maintenance')) {
      onTabChangeRef.current && onTabChangeRef.current('maintenance');
    } else if (command.includes('show obd')) {
      onTabChangeRef.current && onTabChangeRef.current('obd');
    } else if (command.includes('show damage')) {
      onTabChangeRef.current && onTabChangeRef.current('damage');
    } else {
      // For general commands, we can pass to live assistant
      if (!isLive) {
        startLive(command);
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ text: command }));
      }
    }
  };

  const startContinuousListening = async () => {
    const win = window as any;
    if (!('webkitSpeechRecognition' in win) && !('SpeechRecognition' in win)) {
      return;
    }
    
    if (!bgRecognitionRef.current) {
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      bgRecognitionRef.current = new SpeechRecognition();
      bgRecognitionRef.current.continuous = true;
      bgRecognitionRef.current.interimResults = false;
      
      bgRecognitionRef.current.onresult = (event: any) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript.toLowerCase();
        
        if (transcript.includes('hey drive logic') || transcript.includes('hey drivelogic') || transcript.includes('hey drive-logic')) {
          let commandParts = transcript.split('hey drive-logic');
          if (commandParts.length === 1) {
            commandParts = transcript.split('hey drive logic');
          }
          if (commandParts.length === 1) {
            commandParts = transcript.split('hey drivelogic');
          }
          const command = commandParts[commandParts.length - 1].trim();
          
          if (command) {
            processCommand(command);
          } else {
            // just wake word, maybe open assistant
            if (!isLive) startLive();
            else setIsOpen(true);
          }
        }
      };
      
      bgRecognitionRef.current.onerror = (event: any) => {};
      
      bgRecognitionRef.current.onend = () => {
        // Auto restart to keep listening in background
        try {
          if (!isLive) {
            bgRecognitionRef.current?.start();
          }
        } catch (e) { }
      };
    }

    try {
      if (!isLive) bgRecognitionRef.current.start();
    } catch (e) {}
  };

  useImperativeHandle(ref, () => ({
    toggleMic: () => {
      setIsOpen(true);
      if (!isLive) startLive();
    }
  }));

  const startLive = async (initialPrompt?: string | any) => {
    try {
      if (typeof initialPrompt === 'string') {
        initialPromptRef.current = initialPrompt;
      }
      
      setIsOpen(true);
      setError(null);
      setActiveSpeechState('connecting');

      // Stop background listening while live session is active
      try {
        bgRecognitionRef.current?.stop();
      } catch (e) {}

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Connect to Render backend if in production, otherwise use localhost for dev
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const wsUrl = isDev 
        ? `${protocol}//${window.location.host}/live`
        : `wss://drivelogicai-chat.onrender.com/live`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputAudioCtx;
      
      const outputAudioCtx = new AudioContext({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputAudioCtx;

      // Connect analysers for visualization
      const inputAnalyser = inputAudioCtx.createAnalyser();
      inputAnalyser.fftSize = 64;
      inputAnalyserRef.current = inputAnalyser;

      const outputAnalyser = outputAudioCtx.createAnalyser();
      outputAnalyser.fftSize = 64;
      outputAnalyser.connect(outputAudioCtx.destination);
      outputAnalyserRef.current = outputAnalyser;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const source = inputAudioCtx.createMediaStreamSource(stream);
      source.connect(inputAnalyser);

      const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      resetAudioPlayback();

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      ws.onopen = () => {
        setIsLive(true);
        setActiveSpeechState('connecting');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          let errorText = msg.error;
          if (errorText.includes("RESOURCE_EXHAUSTED") || errorText.includes("prepayment credits")) {
            errorText = "Your API Key has run out of prepaid credits. Add balance in Google AI Studio to continue.";
          } else if (errorText.includes("{")) {
            try {
              const parsed = JSON.parse(errorText.replace("API Error: ", ""));
              if (parsed.error && parsed.error.message) {
                errorText = parsed.error.message;
              }
            } catch (e) {
              // ignore
            }
          }
          setError(errorText);
          return;
        }

        if (msg.ready) {
          setActiveSpeechState('listening');
          if (initialPromptRef.current) {
            ws.send(JSON.stringify({ text: initialPromptRef.current }));
            initialPromptRef.current = null; // Clear it after sending
          } else {
            ws.send(JSON.stringify({ text: "Hello! Please introduce yourself to me." }));
          }
          return;
        }

        // Live Audio Output chunks
        if (msg.audio) {
          setActiveSpeechState('speaking');
          playAudioChunk(outputAudioCtx, msg.audio, outputAnalyser);
        }

        // AI text subtitles transcription streaming
        if (msg.text) {
          setActiveSpeechState('speaking');
          setLiveTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.sender === 'ai') {
              return [...prev.slice(0, -1), { ...last, text: last.text + msg.text }];
            } else {
              return [...prev, { id: Math.random().toString(), sender: 'ai', text: msg.text }];
            }
          });
        }

        // User speech transcription streaming
        if (msg.userText) {
          setActiveSpeechState('listening');
          setLiveTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.sender === 'user') {
              return [...prev.slice(0, -1), { ...last, text: msg.userText }];
            } else {
              return [...prev, { id: Math.random().toString(), sender: 'user', text: msg.userText }];
            }
          });
        }

        // Turn completed
        if (msg.turnComplete) {
          setActiveSpeechState('listening');
        }

        // Interruption
        if (msg.interrupted) {
          resetAudioPlayback();
          setActiveSpeechState('listening');
          setLiveTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.sender === 'ai') {
              return [...prev.slice(0, -1), { ...last, text: last.text + " [Interrupted]" }];
            }
            return prev;
          });
        }

        // Live API tool calls triggers
        if (msg.toolCall) {
          setActiveSpeechState('thinking');
          msg.toolCall.functionCalls.forEach((call: any) => {
            if (call.name === 'changeTab' && onTabChangeRef.current) {
              onTabChangeRef.current(call.args.tab);
              if (postCommandActionsRef.current?.changeTab === 'triggerSim') {
                onSetSimulationRef.current && onSetSimulationRef.current(!isSimulationRef.current);
              }
            } else if (call.name === 'diagnoseVehicle' && onDiagnoseRef.current) {
              if (postCommandActionsRef.current?.diagnoseVehicle === 'switchOBD') {
                onTabChangeRef.current && onTabChangeRef.current('obd');
              }
              onDiagnoseRef.current();
            } else if (call.name === 'setNavigation' && onSetNavigationRef.current) {
              onSetNavigationRef.current(call.args.from, call.args.to);
              if (postCommandActionsRef.current?.setNavigation === 'autoRecord') {
                onToggleRecordingRef.current && onToggleRecordingRef.current(true);
              } else if (postCommandActionsRef.current?.setNavigation === 'switchTab') {
                onTabChangeRef.current && onTabChangeRef.current('gps');
              }
            } else if (call.name === 'toggleRecording' && onToggleRecordingRef.current) {
              const start = call.args.action === 'start';
              onToggleRecordingRef.current(start);
              if (postCommandActionsRef.current?.toggleRecording === 'switchGPS') {
                onTabChangeRef.current && onTabChangeRef.current('gps');
              }
            }
          });

          // Acknowledge tool responses
          const response = {
            toolResponse: {
              functionResponses: msg.toolCall.functionCalls.map((call: any) => ({
                id: call.id,
                name: call.name,
                response: { result: "Success" }
              }))
            }
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
          }
        }
      };

      ws.onerror = () => {
        setError("Live connection failed. Check server.");
        stopLive();
      };

      ws.onclose = () => {
        stopLive();
      };

    } catch (err: any) {
      console.error(err);
      if (!navigator.mediaDevices) {
        setError("Mic unavailable. Local network testing requires HTTPS or Capacitor.");
      } else {
        setError("Mic permission denied or unavailable.");
      }
      setActiveSpeechState('idle');
    }
  };

  const stopLive = () => {
    setIsLive(false);
    setActiveSpeechState('idle');
    resetAudioPlayback();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;

    // Resume background listening
    setTimeout(() => {
      try {
        bgRecognitionRef.current?.start();
      } catch (e) {}
    }, 500);
  };

  useEffect(() => {
    return () => {
      stopLive();
    };
  }, []);

  // Compute clean readable labels for status
  const getStatusLabel = () => {
    switch (activeSpeechState) {
      case 'connecting': return 'Connecting Co-Pilot...';
      case 'listening': return 'Listening to you...';
      case 'speaking': return 'AI Co-Pilot speaking...';
      case 'thinking': return 'Co-Pilot is thinking...';
      default: return 'Tap center button to speak';
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-50 w-12 h-12 rounded-full bg-car-success text-white shadow-lg flex items-center justify-center hover:bg-car-success/80 hover:scale-105 active:scale-95 transition-all duration-200 group"
        title="Open Real-time Voice Chat"
      >
        <Sparkles size={20} className="animate-pulse" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 24, x: 20 }}
            className="fixed bottom-24 right-4 z-[60] w-80 h-[420px] glass-card rounded-3xl overflow-hidden border border-car-success/30 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-3 bg-car-success/15 flex items-center justify-between border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-car-success/20 rounded-lg">
                  <Sparkles size={14} className="text-car-success" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 leading-none">Voice Co-Pilot</span>
                  <span className="text-[8px] font-mono text-white/40 leading-none mt-0.5">gemini-3.1-flash-live</span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsOpen(false);
                  stopLive();
                }} 
                className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Subtitles & Scrollable Log */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/25 select-none custom-scrollbar flex flex-col">
              {liveTranscript.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <div className="w-10 h-10 rounded-full bg-car-success/10 border border-car-success/20 flex items-center justify-center text-car-success mb-3">
                    <Headphones size={20} />
                  </div>
                  <p className="text-[11px] font-medium text-white/75">Continuous Real-time Voice Chat</p>
                  <p className="text-[10px] text-white/30 max-w-[180px] leading-relaxed mt-1">
                    Connect and speak freely. The AI will listen, respond, and execute vehicle controls in real-time.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {liveTranscript.map((msg) => (
                    <div key={msg.id} className={cn("flex flex-col gap-1", msg.sender === 'user' ? "items-end" : "items-start")}>
                      <span className="text-[8px] font-mono uppercase tracking-wider text-white/25 flex items-center gap-1 px-1">
                        {msg.sender === 'user' ? (
                          <>You <User size={8} /></>
                        ) : (
                          <><Bot size={8} /> Co-Pilot</>
                        )}
                      </span>
                      <div className={cn(
                        "max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed font-sans shadow-md",
                        msg.sender === 'user' 
                          ? "bg-car-success/20 text-white rounded-tr-none border border-car-success/30" 
                          : "bg-white/5 text-white/90 border border-white/5 rounded-tl-none"
                      )}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>

            {/* Status, Visualization & Controls Container */}
            <div className="p-4 bg-car-bg/95 border-t border-white/5 shrink-0 flex flex-col items-center gap-3">
              {error && (
                <div className="w-full text-[10px] text-car-danger bg-car-danger/10 px-3 py-2 rounded-lg flex items-start gap-2 border border-car-danger/25">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span className="leading-tight">{error}</span>
                </div>
              )}

              {/* Status and Visualizer Waveform */}
              <div className="w-full relative flex flex-col items-center">
                {isLive ? (
                  <canvas 
                    ref={canvasRef} 
                    width={288} 
                    height={48} 
                    className="w-full h-12 bg-black/20 rounded-xl border border-white/5" 
                  />
                ) : (
                  <div className="w-full h-12 flex items-center justify-center bg-black/10 rounded-xl border border-white/5 italic text-[10px] text-white/20 font-mono uppercase tracking-widest">
                    SYSTEM READY
                  </div>
                )}
                <span className={cn(
                  "text-[10px] font-medium mt-1.5 font-sans",
                  activeSpeechState === 'speaking' && "text-car-success",
                  activeSpeechState === 'listening' && "text-car-cyan",
                  activeSpeechState === 'thinking' && "text-car-warning animate-pulse",
                  activeSpeechState === 'idle' && "text-white/40"
                )}>
                  {getStatusLabel()}
                </span>
              </div>

              {/* Mic Controls */}
              <div className="flex items-center gap-4">
                {isLive ? (
                  <button
                    onClick={stopLive}
                    className="w-12 h-12 rounded-full bg-car-danger/15 border border-car-danger/40 text-car-danger flex items-center justify-center hover:bg-car-danger/25 hover:scale-105 active:scale-95 transition-all duration-200"
                    title="Stop Voice Session"
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={startLive}
                    className="w-14 h-14 rounded-full bg-gradient-to-r from-car-success to-car-success/80 text-white flex items-center justify-center hover:brightness-110 hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(46,204,113,0.3)] transition-all duration-200"
                    title="Start Voice Session"
                  >
                    {activeSpeechState === 'connecting' ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <Mic size={24} />
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export default LiveChatAssistant;
