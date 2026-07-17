import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Map as MapIcon, MapPin, Navigation, BrainCircuit, AlertCircle, Info, ArrowRight, Key, Search, AlertTriangle, Mic } from 'lucide-react';
import { Trip, NavigationState } from '../types';
import { getRouteRecommendation } from '../services/geminiService';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { GoogleMap, Marker, TrafficLayer, Polyline, DirectionsService, DirectionsRenderer } from '@react-google-maps/api';
import { cn } from '../lib/utils';

interface GPSTabProps {
  isRecording: boolean;
  trips: Trip[];
  navigation: NavigationState;
  setNavigation: (nav: NavigationState) => void;
  mapsApiKey: string;
  isLoaded: boolean;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

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

// Mock user-posted speed trap data
const MOCK_SPEED_TRAPS = [
  { id: '1', lat: 37.7749, lng: -122.4194, reportedAt: Date.now() - 1000 * 60 * 15 }, // 15 mins ago
  { id: '2', lat: 37.7858, lng: -122.4064, reportedAt: Date.now() - 1000 * 60 * 45 }, // 45 mins ago
  { id: '3', lat: 37.7694, lng: -122.4862, reportedAt: Date.now() - 1000 * 60 * 120 }, // 2 hours ago
];


export default function GPSTab({ isRecording, trips, navigation, setNavigation, mapsApiKey, isLoaded }: GPSTabProps) {
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [showTraffic, setShowTraffic] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isWakeWordActive, setIsWakeWordActive] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
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
      
      if (transcript.includes('hey drive logic') || transcript.includes('hey drivelogic')) {
        setIsAwake(true);
        if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
        awakeTimeoutRef.current = setTimeout(() => setIsAwake(false), 8000);

        let commandParts = transcript.split('hey drive logic');
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
    const originIsString = navigation.from && navigation.from !== 'Current Location';
    const hasOrigin = originIsString || location;

    if (navigation.isActive && navigation.to && hasOrigin) {
      if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) return;
      
      const geocodeLocation = (address: string): Promise<boolean> => {
        return new Promise((resolve) => {
          if (!address || address === 'Current Location') {
            resolve(true);
            return;
          }
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ address }, (results, status) => {
            resolve(status === window.google.maps.GeocoderStatus.OK);
          });
        });
      };

      const checkLocations = async () => {
        const toValid = await geocodeLocation(navigation.to);
        const fromValid = originIsString ? await geocodeLocation(navigation.from) : true;

        if (!toValid || !fromValid) {
          setDirectionsResponse(null);
          setRouteError("One or more locations could not be resolved. Please try a different address.");
          return;
        }

        const ds = new window.google.maps.DirectionsService();
        ds.route({
          origin: originIsString ? navigation.from : { lat: location!.lat, lng: location!.lng },
          destination: navigation.to,
          travelMode: window.google.maps.TravelMode.DRIVING,
          waypoints: navigation.waypoints?.map(wp => ({ location: { lat: wp.lat, lng: wp.lng } })) || []
        }, (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK && result) {
            setDirectionsResponse(result);
            setRouteError(null);
          } else {
            setDirectionsResponse(null);
            if (status === window.google.maps.DirectionsStatus.NOT_FOUND) {
              setRouteError("One or more locations could not be resolved. Please try a different address.");
            } else if (status === window.google.maps.DirectionsStatus.ZERO_RESULTS) {
              setRouteError("No driving route could be found between these locations.");
            } else {
              setRouteError(`Failed to fetch directions: ${status}`);
            }
          }
        });
      };
      
      checkLocations();
    } else {
      setDirectionsResponse(null);
      setRouteError(null);
    }
  }, [navigation, location]);

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
        
        if (followUser && map) {
          map.panTo(newPos);
        }
      },
      (err) => {
        console.warn("Geolocation failed or denied, using fallback coordinates:", err);
        // Fallback to a default location (e.g., San Francisco) if geolocation fails
        const fallbackPos = { lat: 37.7749, lng: -122.4194 };
        setLocation(fallbackPos);
        setAccuracy(100);
        if (followUser && map) {
          map.panTo(fallbackPos);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [map, followUser]);

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback(map: google.maps.Map) {
    setMap(null);
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
        
        map?.panTo({ lat, lng });
        setFollowUser(false);
        setNavigation({ from: 'Current Location', to: address, isActive: true });
        setSearchValue("");
      } else {
        console.error("Geocoding failed:", status);
        alert("Location not found");
      }
    });
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      
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
      {/* Navigation Controls */}
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

      {/* Map View */}
      <div className="relative h-96 rounded-3xl overflow-hidden glass-card border-white/5 flex flex-col scanline-overlay">
        {isLoaded && mapsApiKey ? (
          <>
            {/* Search Bar Overlay */}
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

            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={location || { lat: 37.7749, lng: -122.4194 }}
              zoom={15}
              onLoad={onLoad}
              onUnmount={onUnmount}
              onDragStart={() => setFollowUser(false)}
              onClick={handleMapClick}
              options={{
                styles: darkMapStyles,
                disableDefaultUI: true,
                zoomControl: true,
                clickableIcons: false,
              }}
            >
              {showTraffic && <TrafficLayer />}
              
              {directionsResponse && (
                <DirectionsRenderer
                  options={{
                    directions: directionsResponse,
                    suppressMarkers: false,
                    polylineOptions: {
                      strokeColor: '#2ECC71',
                      strokeOpacity: 0.8,
                      strokeWeight: 6,
                    }
                  }}
                />
              )}
              
              {location && (
                <Marker 
                  position={location} 
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: "#4285F4",
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: "#FFFFFF",
                  }}
                  zIndex={100}
                />
              )}

              {/* Speed Trap Markers */}
              {MOCK_SPEED_TRAPS.map(trap => (
                <Marker
                  key={trap.id}
                  position={{ lat: trap.lat, lng: trap.lng }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: "#EF4444",
                    fillOpacity: 0.8,
                    strokeWeight: 2,
                    strokeColor: "#FFFFFF",
                  }}
                  label={{
                    text: "👮",
                    fontSize: "12px",
                  }}
                  title={`Speed Trap reported ${Math.round((Date.now() - trap.reportedAt) / 60000)} mins ago`}
                />
              ))}

              {/* Waypoint Markers */}
              {navigation.waypoints?.map((wp, i) => (
                <Marker
                  key={`wp-${i}`}
                  position={wp}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: "#F59E0B",
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: "#FFFFFF",
                  }}
                  label={{
                    text: `${i + 1}`,
                    fontSize: "10px",
                    fontWeight: "bold",
                    color: "#000000"
                  }}
                />
              ))}

              {/* Selected Trip Polyline */}
              {selectedTrip && selectedTrip.waypoints.length > 0 && (
                <Polyline
                  path={selectedTrip.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))}
                  options={{
                    strokeColor: '#00F0FF',
                    strokeOpacity: 0.8,
                    strokeWeight: 4,
                  }}
                />
              )}
            </GoogleMap>
            
            {/* Map Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
              <button
                onClick={() => {
                  setFollowUser(true);
                  if (location && map) map.panTo(location);
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

            {/* Live GPS Overlay */}
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

      {/* AI Route Recommendation */}
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

      {/* Trip History for Visual Review */}
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
                    if (map && trip.waypoints.length > 0) {
                      map.panTo({ lat: trip.waypoints[0].lat, lng: trip.waypoints[0].lng });
                    }
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

      {/* Current Location Info */}
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
