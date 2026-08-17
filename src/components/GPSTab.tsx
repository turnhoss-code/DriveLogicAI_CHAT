import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Map as MapIcon, MapPin, Navigation, BrainCircuit, AlertCircle, Info, ArrowRight, Key, Search, AlertTriangle, Mic } from 'lucide-react';
import { Trip, NavigationState } from '../types';
import { getRouteRecommendation } from '../services/geminiService';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { cn } from '../lib/utils';

interface GPSTabProps {
  isRecording: boolean;
  trips: Trip[];
  navigation: NavigationState;
  setNavigation: (nav: NavigationState) => void;
  mapsApiKey: string;
  isLoaded: boolean;
}

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

const MOCK_SPEED_TRAPS = [
  { id: '1', lat: 37.7749, lng: -122.4194, reportedAt: Date.now() - 1000 * 60 * 15 },
  { id: '2', lat: 37.7858, lng: -122.4064, reportedAt: Date.now() - 1000 * 60 * 45 },
  { id: '3', lat: 37.7694, lng: -122.4862, reportedAt: Date.now() - 1000 * 60 * 120 },
];

function Directions({
  from,
  to,
  waypoints,
  location,
  onError
}: {
  from: string;
  to: string;
  waypoints?: { lat: number; lng: number }[];
  location: { lat: number; lng: number } | null;
  onError: (err: string | null) => void;
}) {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService>();
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer>();

  useEffect(() => {
    if (!routesLibrary || !map) return;
    setDirectionsService(new routesLibrary.DirectionsService());
    const renderer = new routesLibrary.DirectionsRenderer({ map });
    
    renderer.setOptions({
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: '#2ECC71',
        strokeOpacity: 0.8,
        strokeWeight: 6,
      }
    });

    setDirectionsRenderer(renderer);
    return () => renderer.setMap(null);
  }, [routesLibrary, map]);

  useEffect(() => {
    if (!directionsService || !directionsRenderer || !from || !to) return;

    let origin: string | google.maps.LatLngLiteral = from;
    if (from.toLowerCase() === 'current location' && location) {
      origin = location;
    }

    directionsService
      .route({
        origin,
        destination: to,
        waypoints: waypoints?.map(wp => ({
          location: new google.maps.LatLng(wp.lat, wp.lng),
          stopover: true
        })),
        travelMode: google.maps.TravelMode.DRIVING,
      })
      .then(response => {
        directionsRenderer.setDirections(response);
        onError(null);
      })
      .catch(err => {
        const errCode = err.code || '';
        const errMsg = err.message || '';
        if (errCode === 'NOT_FOUND' || errMsg.includes('NOT_FOUND')) {
          onError("One or more locations could not be resolved. Please try a different address.");
        } else if (errCode === 'ZERO_RESULTS' || errMsg.includes('ZERO_RESULTS')) {
          onError("No driving route could be found between these locations.");
        } else if (errCode === 'MAX_ROUTE_LENGTH_EXCEEDED' || errMsg.includes('MAX_ROUTE_LENGTH_EXCEEDED') || errMsg.includes('too long')) {
          onError("The requested route is too long to calculate.");
        } else {
          onError("Failed to fetch directions.");
        }
      });
  }, [directionsService, directionsRenderer, from, to, waypoints, location, onError]);

  return null;
}

function TrafficLayerComponent() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(map);
    return () => trafficLayer.setMap(null);
  }, [map]);
  return null;
}

function TripPolyline({ path }: { path: { lat: number, lng: number }[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  
  useEffect(() => {
    if (!map || !mapsLib || !path.length) return;
    
    const polyline = new mapsLib.Polyline({
      path,
      strokeColor: '#00F0FF',
      strokeOpacity: 0.8,
      strokeWeight: 4,
    });
    
    polyline.setMap(map);
    return () => polyline.setMap(null);
  }, [map, mapsLib, path]);
  
  return null;
}

export default function GPSTab({ isRecording, trips, navigation, setNavigation, mapsApiKey, isLoaded }: GPSTabProps) {
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [showTraffic, setShowTraffic] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isWakeWordActive, setIsWakeWordActive] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const awakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const processCommand = (command: string) => {
    setSearchValue(command);
    if (command.includes('navigate to') || command.includes('set destination to') || command.includes('go to')) {
      const destination = command.replace(/.*(navigate to|set destination to|go to)\s+/g, '').trim();
      setNavigation({ from: 'Current Location', to: destination, isActive: true, waypoints: [] });
    } else if (command.includes('add waypoint') || command.includes('add stop')) {
      const waypoint = command.replace(/.*(add waypoint|add stop)\s+/g, '').trim();
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: waypoint }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const currentWaypoints = navigation.waypoints || [];
          setNavigation({ 
            ...navigation, 
            waypoints: [...currentWaypoints, { lat: loc.lat(), lng: loc.lng() }],
            isActive: true 
          });
        }
      });
    } else {
      setNavigation({ ...navigation, to: command, isActive: true });
    }
  };

  const toggleWakeWord = () => {
    if (isWakeWordActive) {
      setIsWakeWordActive(false);
      setIsListening(false);
      setIsAwake(false);
      setMicError(null);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      startContinuousListening();
    }
  };

  const startContinuousListening = async () => {
    const win = window as any;
    if (!('webkitSpeechRecognition' in win) && !('SpeechRecognition' in win)) {
      setMicError('Not Supported');
      return;
    }

    setMicError(null);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err: any) {
      console.warn("Microphone access error:", err);
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setMicError("Permission Denied");
        setIsWakeWordActive(false);
        setIsListening(false);
        setIsAwake(false);
        return;
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('Requested device not found')) {
        setMicError("No Mic Found");
        setIsWakeWordActive(false);
        setIsListening(false);
        setIsAwake(false);
        return;
      }
      setMicError("Mic Error");
    }

    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.continuous = true;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setIsWakeWordActive(true);
      setIsListening(true);
    };
    
    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript.toLowerCase();
      
      if (transcript.includes('hey drive logic') || transcript.includes('hey drivelogic') || transcript.includes('hey drive-logic')) {
        setIsAwake(true);
        if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
        awakeTimeoutRef.current = setTimeout(() => setIsAwake(false), 8000);

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
          setIsAwake(false);
        }
      } else if (isAwake) {
        processCommand(transcript);
        setIsAwake(false);
      }
    };
    
    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.error('Speech recognition error', event.error);
      }
      
      if (event.error === 'not-allowed') {
        setMicError("Permission Denied");
        setIsWakeWordActive(false);
        setIsListening(false);
        setIsAwake(false);
      } else if (event.error === 'audio-capture') {
        setMicError("No Mic Found");
        setIsWakeWordActive(false);
        setIsListening(false);
        setIsAwake(false);
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setMicError("Mic Error");
      }
    };
    
    recognition.onend = () => {
      if (isWakeWordActive && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error("Failed to restart recognition", e);
        }
      } else {
        setIsListening(false);
        setIsAwake(false);
      }
    };
    
    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition", e);
    }
  };

  useEffect(() => {
    return () => {
      setIsWakeWordActive(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (awakeTimeoutRef.current) {
        clearTimeout(awakeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(newPos);
        setAccuracy(pos.coords.accuracy);
      },
      (err) => {
        console.warn("Geolocation failed or denied, using fallback coordinates:", err);
        const fallbackPos = { lat: 37.7749, lng: -122.4194 };
        setLocation(fallbackPos);
        setAccuracy(100);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const handleRecommendation = async () => {
    setIsAnalyzing(true);
    const result = await getRouteRecommendation(trips);
    if (typeof result === 'string') {
      setRecommendation(result);
      setAlerts([]);
    } else {
      setRecommendation(result.recommendation);
      setAlerts(result.alerts || []);
    }
    setIsAnalyzing(false);
  };

  const handleManualSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchValue.trim()) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: searchValue }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const place = results[0];
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || `${lat}, ${lng}`;
        
        setFollowUser(false);
        setNavigation({ from: 'Current Location', to: address, isActive: true });
        setSearchValue("");
      } else {
        console.error("Geocoding failed:", status);
        alert("Location not found");
      }
    });
  };

  const handleMapClick = (e: any) => {
    const lat = e.detail.latLng.lat;
    const lng = e.detail.latLng.lng;
    
    if (lat && lng) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        let destination = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        if (status === 'OK' && results && results[0]) {
          destination = results[0].formatted_address;
        }
        
        if (!navigation.to) {
          setNavigation({ from: 'Current Location', to: destination, isActive: true, waypoints: [] });
        } else {
          const currentWaypoints = navigation.waypoints || [];
          setNavigation({ 
            ...navigation, 
            waypoints: [...currentWaypoints, { lat, lng }],
            isActive: true 
          });
        }
        setFollowUser(false);
      });
    }
  };

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-3xl space-y-4 hud-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-car-accent/10 rounded-xl">
            <Navigation className="text-car-accent" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white uppercase tracking-tighter">Tactical Navigation</h3>
            <p className="text-[10px] font-mono text-car-accent/60 uppercase tracking-widest">HUD Interface v2.5</p>
          </div>
        </div>

        <button
          onClick={() => setNavigation({ ...navigation, isActive: !navigation.isActive })}
          className={`w-full py-3 rounded-xl font-bold text-xs tracking-widest transition-all flex items-center justify-center gap-2 ${
            navigation.isActive 
              ? 'bg-car-danger/20 text-car-danger border border-car-danger/30' 
              : 'bg-car-accent text-white hover:bg-car-accent/80'
          }`}
        >
          {navigation.isActive ? 'CLOSE NAVIGATION WINDOW' : 'OPEN NAVIGATION WINDOW'}
          {!navigation.isActive && <ArrowRight size={14} />}
        </button>

        <button
          onClick={toggleWakeWord}
          className={cn(
            "w-full py-3 rounded-xl font-bold text-xs tracking-widest transition-all flex items-center justify-center gap-2 border border-white/10",
            isWakeWordActive 
              ? isAwake 
                ? "bg-car-success/20 text-car-success border-car-success/30 animate-pulse" 
                : "bg-car-accent/20 text-car-accent border-car-accent/30"
              : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
          )}
        >
          <Mic size={14} className={isAwake ? "animate-bounce" : ""} />
          {micError ? (
            <span className="text-car-danger">{micError.toUpperCase()}</span>
          ) : isWakeWordActive 
            ? isAwake 
              ? "LISTENING FOR COMMAND..." 
              : "SAY 'HEY DRIVE LOGIC'" 
            : "ENABLE VOICE ACTIVATION"}
        </button>
      </div>

      {routeError && (
        <div className="bg-car-danger/10 border border-car-danger/30 text-car-danger p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" size={16} />
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider">Route Error</p>
            <p className="text-xs text-white/70">{routeError}</p>
            <button
              onClick={() => {
                setNavigation({ ...navigation, to: '', isActive: false });
                setRouteError(null);
              }}
              className="text-[10px] font-mono font-bold uppercase tracking-wider text-car-accent hover:underline mt-1 block"
            >
              Clear Destination
            </button>
          </div>
        </div>
      )}

      <div className="relative h-96 rounded-3xl overflow-hidden glass-card border-white/5 flex flex-col scanline-overlay">
        {isLoaded && mapsApiKey ? (
          <>
            <div className="absolute top-4 left-4 right-16 z-10">
              <form
                onSubmit={handleManualSearch}
                className="relative flex items-center"
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                <input
                  type="text"
                  placeholder="Search destination (press Enter)..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="w-full bg-black/60 backdrop-blur-md border border-white/10 rounded-xl py-3 pl-10 pr-12 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-car-accent/50 shadow-lg"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleWakeWord();
                  }}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors",
                    isWakeWordActive ? "bg-car-accent/20 text-car-accent animate-pulse" : "text-white/40 hover:text-white hover:bg-white/10"
                  )}
                  title="Voice Search"
                >
                  <Mic size={16} />
                </button>
              </form>
            </div>

            <Map
              defaultCenter={location || { lat: 37.7749, lng: -122.4194 }}
              defaultZoom={15}
              gestureHandling={'greedy'}
              disableDefaultUI={true}
              mapId="gps_tab_map_id"
              styles={darkMapStyles}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              onDragstart={() => setFollowUser(false)}
              onClick={handleMapClick}
            >
              {showTraffic && <TrafficLayerComponent />}
              
              {navigation.isActive && navigation.to && (
                <Directions 
                  from={navigation.from || 'Current Location'}
                  to={navigation.to}
                  waypoints={navigation.waypoints}
                  location={location}
                  onError={setRouteError}
                />
              )}
              
              {location && (
                <AdvancedMarker position={location} zIndex={100}>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#4285F4',
                    borderRadius: '50%',
                    border: '3px solid white',
                    boxShadow: '0 0 6px rgba(0,0,0,0.5)'
                  }} />
                </AdvancedMarker>
              )}

              {MOCK_SPEED_TRAPS.map(trap => (
                <AdvancedMarker key={trap.id} position={{ lat: trap.lat, lng: trap.lng }} title={`Speed Trap reported ${Math.round((Date.now() - trap.reportedAt) / 60000)} mins ago`}>
                  <div style={{
                    fontSize: '20px',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    padding: '4px',
                    borderRadius: '50%',
                    border: '1px solid #EF4444'
                  }}>
                    👮
                  </div>
                </AdvancedMarker>
              ))}

              {navigation.waypoints?.map((wp, i) => (
                <AdvancedMarker key={`wp-${i}`} position={wp}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: '#F59E0B',
                    borderRadius: '50%',
                    border: '2px solid white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'black',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {i + 1}
                  </div>
                </AdvancedMarker>
              ))}

              {selectedTrip && selectedTrip.waypoints.length > 0 && (
                <TripPolyline path={selectedTrip.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))} />
              )}
            </Map>
            
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
              <button
                onClick={() => {
                  setFollowUser(true);
                }}
                className={cn(
                  "p-3 rounded-xl transition-all border shadow-lg",
                  followUser 
                    ? "bg-car-accent text-white border-car-accent shadow-[0_0_15px_rgba(242,125,38,0.3)]" 
                    : "bg-black/60 text-white/60 border-white/10 hover:bg-black/80"
                )}
                title="Follow My Location"
              >
                <Navigation size={18} className={cn(followUser && "animate-pulse")} />
              </button>
              <button
                onClick={() => setShowTraffic(!showTraffic)}
                className={cn(
                  "p-3 rounded-xl transition-all border shadow-lg",
                  showTraffic 
                    ? "bg-car-accent text-white border-car-accent shadow-[0_0_15px_rgba(242,125,38,0.3)]" 
                    : "bg-black/60 text-white/60 border-white/10 hover:bg-black/80"
                )}
                title="Toggle Traffic Layer"
              >
                <MapIcon size={18} />
              </button>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 shadow-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-car-success animate-pulse" />
                <span className="text-[10px] font-mono text-white/80 uppercase tracking-widest">Live GPS Active</span>
              </div>
              
              {accuracy && (
                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 shadow-lg">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest mr-2">Acc:</span>
                  <span className="text-[10px] font-mono text-car-success">±{accuracy.toFixed(1)}m</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 bg-[#1e1e1e] flex items-center justify-center">
            <div className="absolute inset-0 opacity-20" style={{ 
              backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', 
              backgroundSize: '20px 20px' 
            }} />
            
            <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
              {!mapsApiKey ? (
                <>
                  <div className="p-4 bg-car-warning/20 rounded-full">
                    <Key className="text-car-warning" size={32} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white mb-1">Maps API Key Required</p>
                    <p className="text-[10px] text-white/40">Please provide a Google Maps API Key in Settings to enable live tracking.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-car-accent/20 rounded-full animate-pulse">
                    <MapPin className="text-car-accent" size={32} />
                  </div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">Loading Live GPS Tracking...</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="glass-card p-6 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-car-accent/10 rounded-xl">
              <BrainCircuit className="text-car-accent" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Route Optimization</h3>
              <p className="text-xs text-white/40">AI-Powered Insights</p>
            </div>
          </div>
          <button
            onClick={handleRecommendation}
            disabled={isAnalyzing || trips.length < 2}
            className="px-4 py-2 bg-car-accent text-white rounded-xl text-xs font-bold hover:bg-car-accent/80 transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? 'ANALYZING...' : 'GET RECOMMENDATION'}
          </button>
        </div>

        {trips.length < 2 && (
          <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
            <Info size={14} className="text-car-warning" />
            <p className="text-[10px] text-white/60">Record at least 2 trips to unlock AI route recommendations.</p>
          </div>
        )}

        {recommendation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-white/5 rounded-2xl p-4 text-sm text-white/80 leading-relaxed prose prose-invert max-w-none"
          >
            <ReactMarkdown>{recommendation}</ReactMarkdown>
          </motion.div>
        )}

        {alerts.length > 0 && (
          <div className="space-y-3 mt-4">
            <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Proactive Alerts</h4>
            {alerts.map((alert, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "p-4 rounded-xl border flex items-start gap-3",
                  alert.severity === 'high' ? "bg-car-danger/10 border-car-danger/30 text-car-danger" :
                  alert.severity === 'medium' ? "bg-car-warning/10 border-car-warning/30 text-car-warning" :
                  "bg-car-accent/10 border-car-accent/30 text-car-accent"
                )}
              >
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-1">{alert.type.replace('_', ' ')}</p>
                  <p className="text-sm text-white/80">{alert.message}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {trips.length > 0 && (
        <div className="glass-card p-6 rounded-3xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-car-accent/10 rounded-xl">
              <MapIcon className="text-car-accent" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Trip History</h3>
              <p className="text-xs text-white/40">Select a trip to view its route on the map</p>
            </div>
          </div>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {trips.map(trip => (
              <button
                key={trip.id}
                onClick={() => {
                  if (selectedTripId === trip.id) {
                    setSelectedTripId(null);
                  } else {
                    setSelectedTripId(trip.id);
                    setFollowUser(false);
                  }
                }}
                className={cn(
                  "p-4 rounded-xl border transition-all text-left flex flex-col gap-1",
                  selectedTripId === trip.id 
                    ? "bg-car-accent/20 border-car-accent shadow-[0_0_15px_rgba(242,125,38,0.2)] text-white" 
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                )}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-xs font-bold uppercase tracking-wider">{new Date(trip.startTime).toLocaleDateString()}</span>
                  {selectedTripId === trip.id && <div className="w-2 h-2 rounded-full bg-car-accent" />}
                </div>
                <div className="text-[10px] font-mono opacity-80 mt-1 flex justify-between">
                  <span>{new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{trip.distance.toFixed(1)} km</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
            <MapPin size={16} className="text-white/40" />
          </div>
          <div>
            <p className="text-[8px] uppercase tracking-widest text-white/40">Current Position</p>
            <p className="text-xs font-mono text-white/80">
              {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Detecting...'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[8px] uppercase tracking-widest text-white/40">Accuracy</p>
          <p className={cn(
            "text-xs font-mono",
            accuracy && accuracy < 10 ? "text-car-success" : 
            accuracy && accuracy < 30 ? "text-car-warning" : "text-car-danger"
          )}>
            {accuracy ? `± ${accuracy.toFixed(1)}m` : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}
