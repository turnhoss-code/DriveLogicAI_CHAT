import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Navigation, X, Minimize2, Search, ArrowRight, Key, AlertCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NavigationState } from '../types';
import { cn } from '../lib/utils';
import { Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

interface FloatingMapProps {
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

function Directions({
  from,
  to,
  waypoints,
  location,
  onETAUpdate,
  onError
}: {
  from: string;
  to: string;
  waypoints?: { lat: number; lng: number }[];
  location: { lat: number; lng: number } | null;
  onETAUpdate: (eta: string | null, dist: string | null) => void;
  onError: (err: string | null) => void;
}) {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService>();
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer>();
  const [routes, setRoutes] = useState<google.maps.DirectionsRoute[]>([]);
  const [routeIndex, setRouteIndex] = useState(0);

  useEffect(() => {
    if (!routesLibrary || !map) return;
    setDirectionsService(new routesLibrary.DirectionsService());
    const renderer = new routesLibrary.DirectionsRenderer({ map });
    setDirectionsRenderer(renderer);

    return () => {
      renderer.setMap(null);
    };
  }, [routesLibrary, map]);

  useEffect(() => {
    if (!directionsService || !directionsRenderer || !from || !to) return;

    let origin: string | google.maps.LatLngLiteral = from;
    if (from.toLowerCase() === 'current location' && location) {
      origin = location;
    } else if (from.toLowerCase() === 'current location' && !location) {
      return;
    }

    const fetchRoute = () => {
      directionsService
        .route({
          origin,
          destination: to,
          waypoints: waypoints?.map(wp => ({
            location: new google.maps.LatLng(wp.lat, wp.lng),
            stopover: true
          })),
          travelMode: google.maps.TravelMode.DRIVING,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS
          },
          provideRouteAlternatives: true
        })
        .then(response => {
          directionsRenderer.setDirections(response);
          setRoutes(response.routes);
          const route = response.routes[0].legs[0];
          onETAUpdate(route.duration_in_traffic?.text || route.duration?.text || null, route.distance?.text || null);
          onError(null);
        })
        .catch(err => {
          const errCode = err.code || '';
          const errMsg = err.message || '';
          if (errCode === 'NOT_FOUND' || errMsg.includes('NOT_FOUND')) {
            onError("Location not found.");
          } else if (errCode === 'ZERO_RESULTS' || errMsg.includes('ZERO_RESULTS')) {
            onError("No driving route found.");
          } else {
            onError("Error fetching directions.");
          }
          onETAUpdate(null, null);
        });
    };

    fetchRoute();
    const intervalId = setInterval(fetchRoute, 120000);
    return () => clearInterval(intervalId);
  }, [directionsService, directionsRenderer, from, to, waypoints, location, onETAUpdate, onError]);

  useEffect(() => {
    if (!directionsRenderer) return;
    directionsRenderer.setRouteIndex(routeIndex);
  }, [routeIndex, directionsRenderer]);

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


export default function FloatingMap({ navigation, setNavigation, mapsApiKey, isLoaded }: FloatingMapProps) {
  const [isMinimized, setIsMinimized] = useState(!navigation.isActive);
  const [isMini, setIsMini] = useState(true);
  const [size, setSize] = useState({ width: 280, height: 320 }); 
  const [fromInput, setFromInput] = useState(navigation.from);
  const [toInput, setToInput] = useState(navigation.to);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [followUser, setFollowUser] = useState(true);

  const resizeRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizeRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const rect = resizeRef.current.getBoundingClientRect();
    const newWidth = Math.max(200, window.innerWidth - clientX - 16); 
    const newHeight = Math.max(150, window.innerHeight - clientY - 96); 
    
    setSize({ width: newWidth, height: newHeight });
  }, []);

  const stopResize = useCallback(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('touchmove', handleResize);
    window.removeEventListener('touchend', stopResize);
  }, [handleResize]);

  const startResize = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', handleResize);
    window.addEventListener('touchend', stopResize);
  }, [handleResize, stopResize]);

  useEffect(() => {
    let watchId: number;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(newPos);
        },
        (err) => {
          console.warn("Geolocation failed or denied, using fallback coordinates:", err);
          const fallbackPos = { lat: 37.7749, lng: -122.4194 };
          setLocation(fallbackPos);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
      );
    }
    return () => {
      if (watchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    if (navigation.isActive && isMinimized) {
      setIsMinimized(false);
    }
  }, [navigation.isActive]);

  const handleStart = () => {
    setNavigation({ ...navigation, from: fromInput, to: toInput });
  };

  return (
    <motion.div
      ref={resizeRef}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        width: isMinimized ? 64 : (isMini ? 160 : size.width),
        height: isMinimized ? 64 : (isMini ? 160 : size.height),
      }}
      className={cn(
        "fixed bottom-24 right-4 z-50 glass-card rounded-3xl overflow-hidden border border-car-accent/30 shadow-2xl transition-all duration-300",
        isMinimized && "rounded-full"
      )}
    >
      {isMinimized ? (
        <button
          onClick={() => {
            setIsMinimized(false);
            if (!navigation.isActive) setNavigation({ ...navigation, isActive: true });
          }}
          className="w-full h-full flex items-center justify-center text-car-accent hover:bg-white/5 transition-colors"
        >
          <Navigation size={24} className="animate-pulse" />
        </button>
      ) : (
        <div className="flex flex-col h-full relative">
          {!isMini && (
            <div 
              onMouseDown={startResize}
              onTouchStart={startResize}
              className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize z-[60] flex items-center justify-center group"
            >
              <div className="w-1.5 h-1.5 bg-white/20 rounded-full group-hover:bg-car-accent transition-colors" />
            </div>
          )}

          <div className="p-3 bg-car-accent/10 flex items-center justify-between border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <Navigation size={14} className="text-car-accent shrink-0" />
              {!isMini && <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 truncate">Live Navigation</span>}
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMini(!isMini)} 
                className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                title={isMini ? "Expand" : "Mini View"}
              >
                <Minimize2 size={12} className={cn(isMini && "rotate-180")} />
              </button>
              {!isMini && (
                <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
                  <div className="w-3 h-0.5 bg-current rounded-full" />
                </button>
              )}
              <button onClick={() => { setIsMinimized(true); setNavigation({ ...navigation, isActive: false }); }} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
                <X size={12} />
              </button>
            </div>
          </div>

          {!isMini && (
            <div className="p-3 space-y-2 bg-black/20 shrink-0">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-success" />
                <input
                  type="text"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, from: fromInput })}
                  placeholder="From..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-8 pr-4 text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                />
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-danger" />
                <input
                  type="text"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, to: toInput })}
                  placeholder="To..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-8 pr-4 text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                />
              </div>
            </div>
          )}

          <div className="flex-1 relative bg-[#151619] overflow-hidden">
            {routeError && (
              <div className="absolute top-2 left-2 right-12 bg-car-danger/90 backdrop-blur-sm border border-car-danger/50 p-1.5 rounded-lg text-white z-30 flex items-center gap-1.5 shadow-lg">
                <AlertTriangle className="shrink-0 text-white" size={11} />
                <span className="text-[9px] font-bold tracking-tight line-clamp-2">{routeError}</span>
              </div>
            )}
            
            <Map
              defaultCenter={location || { lat: 37.7749, lng: -122.4194 }}
              defaultZoom={isMini ? 13 : 15}
              gestureHandling={'greedy'}
              disableDefaultUI={true}
              mapId="floating_map_id"
              styles={darkMapStyles}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              onDragstart={() => setFollowUser(false)}
            >
              <TrafficLayerComponent />
              {location && (
                <AdvancedMarker position={location}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor: '#4285F4',
                    borderRadius: '50%',
                    border: '2px solid white',
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                  }} />
                </AdvancedMarker>
              )}
              {navigation.from && navigation.to && (
                <Directions 
                  from={navigation.from}
                  to={navigation.to}
                  waypoints={navigation.waypoints}
                  location={location}
                  onETAUpdate={(e, d) => {
                    setEta(e);
                    setDistance(d);
                  }}
                  onError={(err) => setRouteError(err)}
                />
              )}
            </Map>

            {(eta || distance) && !isMini && (
              <div className="absolute bottom-3 left-3 right-3 p-2 glass-card rounded-xl border border-white/5 flex items-center justify-between z-10 pointer-events-none">
                <div>
                  <p className="text-[7px] uppercase tracking-widest text-white/40">ETA</p>
                  <p className="text-[10px] font-bold text-white">{eta || '--'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[7px] uppercase tracking-widest text-white/40">Dist</p>
                  <p className="text-[10px] font-bold text-car-accent">{distance || '--'}</p>
                </div>
              </div>
            )}

            {isMini && (eta || distance) && (
              <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg flex justify-between items-center z-10 pointer-events-none">
                <span className="text-[8px] font-bold text-white">{eta}</span>
                <span className="text-[8px] font-bold text-car-accent">{distance}</span>
              </div>
            )}

            <button
              onClick={() => {
                setFollowUser(true);
              }}
              className={cn(
                "absolute top-2 right-2 p-1.5 rounded-lg border transition-all z-20 pointer-events-auto",
                followUser 
                  ? "bg-car-accent text-white border-car-accent" 
                  : "bg-black/60 text-white/60 border-white/10 hover:bg-black/80"
              )}
              title="Follow Me"
            >
              <Navigation size={12} className={cn(followUser && "animate-pulse")} />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
