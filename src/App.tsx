/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Activity, Gauge, Map as MapIcon, History, Play, Square, BrainCircuit, AlertTriangle, ChevronRight, Settings, X, Key, Wrench, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OBDData, Trip, DamagePoint, TripEvent, SensorPoint, NavigationState, PostCommandActions } from './types';
import { cn } from './lib/utils';
import OBDTab from './components/OBDTab';
import DamageLogTab from './components/DamageLogTab';
import GPSTab from './components/GPSTab';
import FloatingMap from './components/FloatingMap';
import ChatAssistant, { ChatAssistantHandle } from './components/ChatAssistant';
import LiveChatAssistant from './components/LiveChatAssistant';
import MaintenanceTab from './components/MaintenanceTab';
import { runAIDiagnosis } from './services/geminiService';
import { MaintenanceTask } from './types';
import { useJsApiLoader } from '@react-google-maps/api';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestore';
import { CreditCard, Sparkles, Lock, ShieldAlert, Check } from 'lucide-react';

const DEFAULT_MAPS_KEY = "AIzaSyDX-VRPvfH-AzKUwmtu1DQ9_vzDn4y2f9E";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const chatAssistantRef = useRef<ChatAssistantHandle>(null);
  const [activeTab, setActiveTab] = useState<'obd' | 'damage' | 'gps' | 'maintenance'>('obd');
  const [obdData, setObdData] = useState<OBDData>({
    rpm: 0,
    speed: 0,
    coolantTemp: 90,
    throttlePos: 0,
    load: 0,
    voltage: 14.2,
    dtcs: [],
    readiness: {
      misfire: true,
      fuelSystem: true,
      components: true,
      catalyst: true,
      evap: true,
      oxygenSensor: true,
    },
    timestamp: Date.now(),
  });
  const [navigation, setNavigation] = useState<NavigationState>({
    from: '',
    to: '',
    isActive: true,
  });
  const [damageScore, setDamageScore] = useState(0);
  const [damageHistory, setDamageHistory] = useState<DamagePoint[]>([]);
  const [trips, setTrips] = useState<Trip[]>(() => {
    const saved = localStorage.getItem('ztcd_trips');
    return saved ? JSON.parse(saved) : [];
  });
  const [isRecording, setIsRecording] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Partial<Trip> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
    const [sensorHistory, setSensorHistory] = useState<SensorPoint[]>([]);
    const [apiKeys, setApiKeys] = useState({
      gemini: localStorage.getItem('ztcd_gemini_api_key') || process.env.GEMINI_API_KEY || '',
      maps: localStorage.getItem('ztcd_maps_api_key') || DEFAULT_MAPS_KEY || import.meta.env.VITE_MAPS_API_KEY,
    });
    const [isSimulation, setIsSimulation] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [obdCharacteristic, setObdCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [totalMileage, setTotalMileage] = useState(() => {
    const saved = localStorage.getItem('ztcd_mileage');
    return saved ? Number(saved) : 45200; // Starting mileage
  });
  const [postCommandActions, setPostCommandActions] = useState<PostCommandActions>(() => {
    const saved = localStorage.getItem('ztcd_post_command_actions');
    return saved ? JSON.parse(saved) : {
      changeTab: 'speakTab',
      setNavigation: 'switchTab',
      diagnoseVehicle: 'switchOBD',
      toggleRecording: 'speakStatus'
    };
  });
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [vehicleModel, setVehicleModel] = useState(() => {
    return localStorage.getItem('ztcd_vehicle_model') || '2023 Toyota Camry';
  });

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);

  const handleSubscribeUser = async () => {
    if (!user) {
      setLoginError("You must be logged in to subscribe.");
      return;
    }
    setIsSubscribing(true);
    try {
      if ((user as any).isDemo) {
        setIsSubscribed(true);
        setUser({
          ...user,
          isSubscribed: true
        } as any);
        setShowPaywall(false);
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        isSubscribed: true,
        updatedAt: Date.now()
      });
      setIsSubscribed(true);
      setShowPaywall(false);
    } catch (error: any) {
      console.error("Failed to subscribe", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleUnsubscribeUser = async () => {
    if (!user) return;
    setIsSubscribing(true);
    try {
      if ((user as any).isDemo) {
        setIsSubscribed(false);
        setUser({
          ...user,
          isSubscribed: false
        } as any);
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        isSubscribed: false,
        updatedAt: Date.now()
      });
      setIsSubscribed(false);
    } catch (error: any) {
      console.error("Failed to unsubscribe", error);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleEmailPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsAuthActionLoading(true);

    if (!email || !password) {
      setLoginError("Please enter both email and password.");
      setIsAuthActionLoading(false);
      return;
    }

    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth action failed", error);
      let errMsg = error.message;
      if (error.code === 'auth/weak-password') {
        errMsg = "Password should be at least 6 characters.";
      } else if (error.code === 'auth/email-already-in-use') {
        errMsg = "This email is already in use.";
      } else if (error.code === 'auth/invalid-credential') {
        errMsg = "Invalid email or password.";
      } else if (error.code === 'auth/network-request-failed') {
        errMsg = "Network request failed. This may be due to ad blockers or running inside the preview iframe. Please open the app in a new tab.";
      }
      setLoginError(errMsg);
    } finally {
      setIsAuthActionLoading(false);
    }
  };
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>(() => {
    const saved = localStorage.getItem('ztcd_maintenance');
    return saved ? JSON.parse(saved) : [
      {
        id: '1',
        name: 'Synthetic Oil Change',
        type: 'oil_change',
        intervalMiles: 5000,
        intervalMonths: 6,
        lastCompletedMiles: 40000,
        lastCompletedDate: Date.now() - 1000 * 60 * 60 * 24 * 150, // 5 months ago
      },
      {
        id: '2',
        name: 'Tire Rotation',
        type: 'tire_rotation',
        intervalMiles: 6000,
        intervalMonths: 6,
        lastCompletedMiles: 42000,
        lastCompletedDate: Date.now() - 1000 * 60 * 60 * 24 * 60, // 2 months ago
      }
    ];
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAuthLoading(false);
        
        // Test firestore connection
        try {
          let userDoc;
          try {
            userDoc = await getDocFromServer(doc(db, 'users', currentUser.uid));
          } catch (error) {
            if (error instanceof Error && error.message.includes('the client is offline')) {
              console.error("Please check your Firebase configuration.");
            } else {
              handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
            }
            return;
          }

          if (!userDoc.exists()) {
            try {
              await setDoc(doc(db, 'users', currentUser.uid), {
                email: currentUser.email,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isSubscribed: false
              });
              setIsSubscribed(false);
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, `users/${currentUser.uid}`);
            }
          } else {
            const data = userDoc.data();
            setIsSubscribed(!!data?.isSubscribed);
            if (data?.trips && Array.isArray(data.trips)) {
              // Merge local trips and firestore trips based on IDs, preferring firestore ones
              setTrips(prev => {
                const existingIds = new Set(data.trips.map((t: Trip) => t.id));
                const uniqueLocalTrips = prev.filter(t => !existingIds.has(t.id));
                const merged = [...data.trips, ...uniqueLocalTrips].sort((a, b) => b.startTime - a.startTime);
                return merged;
              });
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          } else {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          }
        }
      } else {
        setUser(prev => {
          if (prev && (prev as any).isDemo) {
            setIsSubscribed(!!(prev as any).isSubscribed);
            return prev;
          }
          setIsSubscribed(false);
          return null;
        });
        setIsAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Start voice assistant on mount
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      chatAssistantRef.current?.toggleMic();
    }, 1000);
    return () => clearTimeout(timer);
  }, [user]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKeys.maps
  });

  // Simulation logic
  useEffect(() => {
    if (!isSimulation) {
      setConnectionStatus('connected');
      return;
    }
    setConnectionStatus('disconnected');
    
    const interval = setInterval(() => {
      setObdData(prev => {
        // Random walk for simulation
        const targetRpm = isRecording ? 2000 + Math.random() * 1000 : 800 + Math.random() * 50;
        const targetSpeed = isRecording ? 40 + Math.random() * 20 : 0;
        
        return {
          rpm: Math.round(prev.rpm + (targetRpm - prev.rpm) * 0.1),
          speed: Math.round(prev.speed + (targetSpeed - prev.speed) * 0.1),
          coolantTemp: 90 + Math.sin(Date.now() / 10000) * 2,
          throttlePos: isRecording ? 15 + Math.random() * 10 : 0,
          load: isRecording ? 20 + Math.random() * 15 : 5,
          voltage: 14.1 + Math.random() * 0.2,
          dtcs: isRecording && Math.random() > 0.95 ? ['P0300', 'P0171'] : prev.dtcs,
          readiness: prev.readiness,
          timestamp: Date.now(),
        };
      });

      // Sensor simulation (Accel & Gyro) - Toned down
      const accel = isRecording ? 0.2 + Math.random() * 0.8 : 0.05 + Math.random() * 0.1;
      const rotation = isRecording ? 5 + Math.random() * 20 : 0.5 + Math.random() * 2;

      setSensorHistory(prev => {
        const newHistory = [...prev, { accel, gyro: rotation, timestamp: Date.now() }];
        return newHistory.slice(-60);
      });

      // Damage score simulation based on "driving behavior" - Toned down
      setDamageScore(prev => {
        let delta = (Math.random() - 0.5) * 0.5; // Smaller random fluctuations
        if (isRecording && (accel > 1.2 || rotation > 35)) delta += 5; // Less frequent and smaller "Harsh event"
        const next = Math.max(0, Math.min(100, prev + delta));
        
        setDamageHistory(history => {
          const newHistory = [...history, { score: next, timestamp: Date.now() }];
          return newHistory.slice(-60);
        });

        if (isRecording) {
          setCurrentTrip(trip => {
            if (!trip) return trip;
            
            let newEvents = trip.events || [];
            
            // Occasionally simulate an event if damage is high
            if (next > 40 && Math.random() > 0.7) {
              const rand = Math.random();
              const eventType = rand > 0.66 ? 'harsh_braking' : rand > 0.33 ? 'rapid_acceleration' : 'harsh_cornering';
              const lastWaypoint = trip.waypoints?.[trip.waypoints.length - 1];
              newEvents = [...newEvents, {
                type: eventType as any,
                severity: next,
                timestamp: Date.now(),
                location: lastWaypoint ? { lat: lastWaypoint.lat, lng: lastWaypoint.lng } : undefined
              }];
            }

            return {
              ...trip,
              damageHistory: [...(trip.damageHistory || []), { score: next, timestamp: Date.now() }],
              events: newEvents,
            };
          });
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Real GPS Tracking
  useEffect(() => {
    let watchId: number;

    if (isRecording && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          setCurrentTrip(trip => {
            if (!trip) return trip;
            
            const newLoc = { lat: latitude, lng: longitude, timestamp: Date.now() };
            const newWaypoints = [...(trip.waypoints || []), newLoc];
            
            // Calculate distance if there's a previous waypoint
            let addedDistance = 0;
            if (trip.waypoints && trip.waypoints.length > 0) {
              const lastLoc = trip.waypoints[trip.waypoints.length - 1];
              // Haversine formula
              const R = 3958.8; // Radius of the Earth in miles
              const rlat1 = lastLoc.lat * (Math.PI/180);
              const rlat2 = latitude * (Math.PI/180);
              const difflat = rlat2 - rlat1;
              const difflon = (longitude - lastLoc.lng) * (Math.PI/180);
              const d = 2 * R * Math.asin(Math.sqrt(Math.sin(difflat/2)*Math.sin(difflat/2)+Math.cos(rlat1)*Math.cos(rlat2)*Math.sin(difflon/2)*Math.sin(difflon/2)));
              addedDistance = d;
            }

            if (addedDistance > 0) {
              setTotalMileage(prev => prev + addedDistance);
            }

            return {
              ...trip,
              waypoints: newWaypoints,
              distance: (trip.distance || 0) + addedDistance
            };
          });
        },
        (error) => {
          console.warn("GPS Tracking warning (falling back/retrying):", error);
        },
        {
          enableHighAccuracy: false,
          maximumAge: 10000,
          timeout: 10000
        }
      );
    }

    return () => {
      if (watchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isRecording]);

  useEffect(() => {
    localStorage.setItem('ztcd_trips', JSON.stringify(trips));
    
    // Sync to Firestore if user is authenticated
    if (user && !isAuthLoading && trips.length > 0) {
      updateDoc(doc(db, 'users', user.uid), {
        trips: trips,
        updatedAt: Date.now()
      }).catch(err => {
        if (err.code === 'not-found' || (err instanceof Error && err.message.includes('not found'))) {
          setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            trips: trips
          }, { merge: true }).catch(console.error);
        } else {
          console.error("Failed to sync trips to Firestore", err);
        }
      });
    }
  }, [trips, user, isAuthLoading]);

  useEffect(() => {
    localStorage.setItem('ztcd_mileage', totalMileage.toString());
  }, [totalMileage]);

  useEffect(() => {
    localStorage.setItem('ztcd_maintenance', JSON.stringify(maintenanceTasks));
  }, [maintenanceTasks]);

  const startTrip = () => {
    setIsRecording(true);
    setCurrentTrip({
      id: Math.random().toString(36).substr(2, 9),
      startTime: Date.now(),
      waypoints: [],
      events: [],
      damageHistory: [],
      distance: 0,
    });
  };

  const stopTrip = () => {
    if (!currentTrip) return;
    
    const finishedTrip: Trip = {
      ...currentTrip as Trip,
      endTime: Date.now(),
      averageDamageScore: (currentTrip.damageHistory?.reduce((acc, p) => acc + p.score, 0) || 0) / (currentTrip.damageHistory?.length || 1),
    };

    setTrips(prev => [finishedTrip, ...prev]);
    setIsRecording(false);
    setCurrentTrip(null);
  };

  const tabs = [
    { id: 'obd', label: 'OBD Diagnosis', icon: Gauge },
    { id: 'damage', label: 'Damage Log', icon: Activity },
    { id: 'gps', label: 'GPS Routes', icon: MapIcon },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  ] as const;

  // Real Sensor Collection (Accel & Gyro)
  useEffect(() => {
    if (isSimulation) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      const rot = event.rotationRate;
      
      let totalAccel = 0;
      let totalRot = 0;

      if (acc) {
        // Calculate G-force magnitude
        totalAccel = Math.sqrt((acc.x || 0)**2 + (acc.y || 0)**2 + (acc.z || 0)**2) / 9.81;
      }

      if (rot) {
        // Calculate rotation magnitude (deg/s)
        totalRot = Math.sqrt((rot.alpha || 0)**2 + (rot.beta || 0)**2 + (rot.gamma || 0)**2);
      }

      setSensorHistory(prev => {
        const newHistory = [...prev, { accel: totalAccel, gyro: totalRot, timestamp: Date.now() }];
        return newHistory.slice(-120); // Keep longer history for better diagnosis
      });

      // Simple real-time damage estimation
      if (totalAccel > 1.5 || totalRot > 50) {
        setDamageScore(prev => Math.min(100, prev + (isRecording ? 1 : 0.1)));
      }
    };

    if (window.DeviceMotionEvent) {
      // Request permission for iOS 13+
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        (DeviceMotionEvent as any).requestPermission()
          .then((response: string) => {
            if (response === 'granted') {
              window.addEventListener('devicemotion', handleMotion);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('devicemotion', handleMotion);
      }
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isSimulation, isRecording]);

  // Real OBD-II Connection Logic
  const connectToOBD = async () => {
    try {
      if (!navigator.bluetooth) {
        throw new Error(
          "Bluetooth is not supported in this browser.\n\n" +
          "1. Use Chrome or Edge (Safari/Firefox do not support Web Bluetooth).\n" +
          "2. If using iPhone, try 'Bluefy' or 'WebBle' browser.\n" +
          "3. If in AI Studio, try clicking 'Open in New Tab' as iframes may block Bluetooth access."
        );
      }

      // Broaden discovery to avoid "User cancelled" due to device not appearing in filtered list
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '0000fff0-0000-1000-8000-00805f9b34fb', 
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '000018f0-0000-1000-8000-00805f9b34fb' // Standard OBD-II service
        ]
      }).catch(err => {
        if (err.name === 'NotFoundError') {
          throw new Error("No device selected or found. Ensure your OBD-II adapter is powered on and in pairing mode.");
        }
        if (err.name === 'SecurityError') {
          throw new Error("Bluetooth permission denied. Please allow Bluetooth access in your browser settings.");
        }
        throw err;
      });

      setConnectionStatus('connecting');

      if (!device) {
        throw new Error("No device selected. Please try again.");
      }

      if (!device.gatt) {
        throw new Error("GATT server is unavailable on this device.");
      }

      // Add a timeout to the connection attempt
      const connectPromise = device.gatt.connect();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Connection timed out. Please move closer to the adapter and try again.")), 10000)
      );
      
      const server = await Promise.race([connectPromise, timeoutPromise]);
      const services = await server.getPrimaryServices();
      
      if (!services || services.length === 0) throw new Error("No compatible OBD-II services found on this device.");
      
      const service = services[0];
      const characteristics = await service.getCharacteristics();
      let writeChar: BluetoothRemoteGATTCharacteristic | undefined;
      let notifyChar: BluetoothRemoteGATTCharacteristic | undefined;

      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          writeChar = char;
        }
        if (char.properties.notify || char.properties.indicate) {
          notifyChar = char;
        }
      }

      if (!writeChar || !notifyChar) throw new Error("No suitable communication characteristic found. The adapter may not be fully compatible.");

      setBluetoothDevice(device);
      setIsSimulation(false);
      setConnectionStatus('connected');
      
      // Start polling loop
      startOBDPoll(writeChar, notifyChar);
    } catch (error) {
      setConnectionStatus('disconnected');
      const message = error instanceof Error ? error.message : "An unexpected Bluetooth error occurred.";
      console.error("Bluetooth Error:", message);
      throw new Error(message);
    }
  };

  const parseOBDResponse = (buffer: string) => {
    const lines = buffer.split(/[\r\n]+/);
    lines.forEach(line => {
      const cleanLine = line.replace(/\s+/g, '').toUpperCase();
      
      // Parse Engine Load (0104 -> 41 04 A)
      if (cleanLine.includes('4104')) {
        const idx = cleanLine.indexOf('4104');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        if (!isNaN(a)) {
          setObdData(prev => ({ ...prev, load: (a * 100) / 255, timestamp: Date.now() }));
        }
      }

      // Parse RPM (010C -> 41 0C A B)
      if (cleanLine.includes('410C')) {
        const idx = cleanLine.indexOf('410C');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        const b = parseInt(cleanLine.substring(idx + 6, idx + 8), 16);
        if (!isNaN(a) && !isNaN(b)) {
          const rpm = ((a * 256) + b) / 4;
          setObdData(prev => ({ ...prev, rpm: Math.round(rpm), timestamp: Date.now() }));
        }
      }
      
      // Parse Speed (010D -> 41 0D A)
      if (cleanLine.includes('410D')) {
        const idx = cleanLine.indexOf('410D');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        if (!isNaN(a)) {
          setObdData(prev => ({ ...prev, speed: a, timestamp: Date.now() }));
        }
      }
      
      // Parse Coolant Temp (0105 -> 41 05 A)
      if (cleanLine.includes('4105')) {
        const idx = cleanLine.indexOf('4105');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        if (!isNaN(a)) {
          setObdData(prev => ({ ...prev, coolantTemp: a - 40, timestamp: Date.now() }));
        }
      }

      // Parse Throttle Position (0111 -> 41 11 A)
      if (cleanLine.includes('4111')) {
        const idx = cleanLine.indexOf('4111');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        if (!isNaN(a)) {
          setObdData(prev => ({ ...prev, throttlePos: (a * 100) / 255, timestamp: Date.now() }));
        }
      }

      // Parse Voltage (AT RV)
      if (cleanLine.match(/^[0-9.]+[V]$/)) {
        const voltage = parseFloat(cleanLine.replace('V', ''));
        if (!isNaN(voltage)) {
          setObdData(prev => ({ ...prev, voltage, timestamp: Date.now() }));
        }
      }

      // Parse DTCs (03 -> 43 01 02 03 04 05 06)
      if (cleanLine.includes('43')) {
        const idx = cleanLine.indexOf('43');
        const codesData = cleanLine.substring(idx + 2);
        const codes: string[] = [];
        for (let i = 0; i < codesData.length - 3; i += 4) {
          const code = codesData.substring(i, i + 4);
          if (code !== '0000' && /^[0-9A-F]{4}$/.test(code)) {
            const prefix = ['P', 'C', 'B', 'U'][parseInt(code[0], 16) >> 2];
            if (prefix) {
              codes.push(prefix + code.substring(1));
            }
          }
        }
        if (codes.length > 0) {
          setObdData(prev => ({ ...prev, dtcs: codes, timestamp: Date.now() }));
        }
      }

      // Parse Readiness (0101 -> 41 01 A B C D)
      if (cleanLine.includes('4101')) {
        const idx = cleanLine.indexOf('4101');
        const b = parseInt(cleanLine.substring(idx + 6, idx + 8), 16);
        const c = parseInt(cleanLine.substring(idx + 8, idx + 10), 16);
        if (!isNaN(b) && !isNaN(c)) {
          setObdData(prev => ({
            ...prev,
            readiness: {
              misfire: !(b & 0x01),
              fuelSystem: !(b & 0x02),
              components: !(b & 0x04),
              catalyst: !(c & 0x01),
              evap: !(c & 0x04),
              oxygenSensor: !(c & 0x10),
            },
            timestamp: Date.now()
          }));
        }
      }
    });
  };

  const connectToSerialOBD = async () => {
    try {
      if (!('serial' in navigator)) {
        throw new Error(
          "Web Serial API is not supported in this browser.\n\n" +
          "1. Use Chrome or Edge on a Desktop computer (Mobile browsers do not support Web Serial).\n" +
          "2. If in AI Studio, try clicking 'Open in New Tab' as iframes may block Serial access."
        );
      }

      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 38400 }); // Standard baud rate for ELM327 / 1260 USB cables

      setConnectionStatus('connecting');
      setIsSimulation(false);
      
      startSerialOBDPoll(port);
      setConnectionStatus('connected');
    } catch (error) {
      setConnectionStatus('disconnected');
      const message = error instanceof Error ? error.message : "An unexpected Serial error occurred.";
      console.error("Serial Error:", message);
      throw new Error(message);
    }
  };

  const startSerialOBDPoll = async (port: any) => {
    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    const writer = textEncoder.writable.getWriter();

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    let buffer = '';
    let isWaitingForPrompt = false;
    let commandQueue: string[] = [];
    let isProcessingQueue = false;
    let isPollingActive = true;

    const processQueue = async () => {
      if (isProcessingQueue || commandQueue.length === 0 || isWaitingForPrompt || !isPollingActive) return;
      
      isProcessingQueue = true;
      const cmd = commandQueue.shift();
      if (cmd) {
        isWaitingForPrompt = true;
        try {
          await writer.write(cmd + '\r');
        } catch (e) {
          console.warn("Command failed:", cmd, e);
          isWaitingForPrompt = false;
        }
      }
      isProcessingQueue = false;
    };

    const readLoop = async () => {
      try {
        while (isPollingActive) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buffer += value;
            if (buffer.includes('>')) {
              parseOBDResponse(buffer);
              buffer = '';
              isWaitingForPrompt = false;
              processQueue();
            }
          }
        }
      } catch (error) {
        console.error("Serial read error:", error);
      } finally {
        reader.releaseLock();
      }
    };

    readLoop();

    const queueCommand = (cmd: string) => {
      commandQueue.push(cmd);
      processQueue();
    };

    queueCommand('ATZ');
    queueCommand('ATE0');
    queueCommand('ATL0');
    queueCommand('ATH0');
    queueCommand('ATSP0');

    const pollInterval = setInterval(() => {
      if (!isPollingActive) {
        clearInterval(pollInterval);
        return;
      }
      if (commandQueue.length < 3) {
        queueCommand('010C');
        queueCommand('010D');
        queueCommand('0105');
        if (Math.random() > 0.8) {
          queueCommand('0101');
          queueCommand('03');
        }
      }
    }, 1000);
  };

  const startOBDPoll = async (writeChar: BluetoothRemoteGATTCharacteristic, notifyChar: BluetoothRemoteGATTCharacteristic) => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let isWaitingForPrompt = false;
    let commandQueue: string[] = [];
    let isProcessingQueue = false;
    let isPollingActive = true;

    const processQueue = async () => {
      if (isProcessingQueue || commandQueue.length === 0 || isWaitingForPrompt || !isPollingActive) return;
      
      isProcessingQueue = true;
      const cmd = commandQueue.shift();
      if (cmd) {
        isWaitingForPrompt = true;
        try {
          if (writeChar.properties.writeWithoutResponse) {
            await writeChar.writeValueWithoutResponse(encoder.encode(cmd + '\r'));
          } else {
            await writeChar.writeValue(encoder.encode(cmd + '\r'));
          }
        } catch (e) {
          console.warn("Command failed:", cmd, e);
          isWaitingForPrompt = false; // Reset on failure
        }
      }
      isProcessingQueue = false;
    };

    const handleData = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      
      const chunk = decoder.decode(value);
      buffer += chunk;

      if (buffer.includes('>')) {
        parseOBDResponse(buffer);
        buffer = ''; // Reset buffer after prompt
        isWaitingForPrompt = false;
        processQueue();
      }
    };

    if (notifyChar.properties.notify) {
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', handleData);
    }

    const queueCommand = (cmd: string) => {
      commandQueue.push(cmd);
      processQueue();
    };

    // ELM327 Initial Setup
    queueCommand('ATZ');    // Reset
    queueCommand('ATE0');   // Echo off
    queueCommand('ATL0');   // Linefeeds off
    queueCommand('ATH0');   // Headers off
    queueCommand('ATSP0');  // Auto protocol

    // Polling Loop
    const pollInterval = setInterval(() => {
      if (!writeChar.service.device.gatt?.connected) {
        clearInterval(pollInterval);
        isPollingActive = false;
        return;
      }
      
      // Only queue new commands if the queue is relatively empty to prevent buildup
      if (commandQueue.length < 3) {
        queueCommand('010C'); // RPM
        queueCommand('010D'); // Speed
        queueCommand('0105'); // Coolant
        queueCommand('0104'); // Load
        queueCommand('0111'); // Throttle
        queueCommand('ATRV'); // Voltage
        
        // Poll readiness and DTCs less frequently
        if (Math.random() > 0.9) {
          queueCommand('0101'); // Readiness
          queueCommand('03');   // DTCs
        }
      }
    }, 1000); // Poll every second
  };

  const saveApiKeys = () => {
    const previousMapsKey = localStorage.getItem('ztcd_maps_api_key') || DEFAULT_MAPS_KEY || import.meta.env.VITE_MAPS_API_KEY;
    const isMapsKeyChanged = previousMapsKey !== apiKeys.maps;

    localStorage.setItem('ztcd_gemini_api_key', apiKeys.gemini);
    localStorage.setItem('ztcd_maps_api_key', apiKeys.maps);
    localStorage.setItem('ztcd_post_command_actions', JSON.stringify(postCommandActions));
    setShowSettings(false);

    // Forces a full page reload so Google Maps API script tag can be safely reset with the new tracking key.
    if (isMapsKeyChanged) {
      window.location.reload();
    }
  };

  const handleAIDiagnosis = async () => {
    setActiveTab('obd');
    setIsAnalyzing(true);
    try {
      const result = await runAIDiagnosis(obdData, sensorHistory, vehicleModel);
      setDiagnosis(result);
      setIsAnalyzing(false);
      return result;
    } catch (error) {
      setIsAnalyzing(false);
      console.error(error);
      return "AI Diagnosis is currently unavailable. Please check your API key.";
    }
  };

  const criticalTasks = maintenanceTasks.filter(task => {
    const milesSince = totalMileage - task.lastCompletedMiles;
    const monthsSince = (Date.now() - task.lastCompletedDate) / (1000 * 60 * 60 * 24 * 30);
    const milesProgress = (milesSince / task.intervalMiles) * 100;
    const timeProgress = (monthsSince / task.intervalMonths) * 100;
    return Math.max(milesProgress, timeProgress) >= 100;
  });

  const handleLogin = async () => {
    try {
      setLoginError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed", error);
      if (error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/popup-blocked' || error?.message?.includes('INTERNAL ASSERTION FAILED') || error?.message?.includes('popup-blocked')) {
        setLoginError("Login failed due to browser popup restrictions inside the preview window. Please open this app in a new tab to authenticate successfully.");
      } else if (error?.code === 'auth/network-request-failed') {
        setLoginError("Network request failed. This may be due to ad blockers or running inside the preview iframe. Please open the app in a new tab.");
      } else {
        setLoginError(`Login failed: ${error?.message || error}`);
      }
    }
  };

  const handleDemoLogin = () => {
    setUser({
      uid: 'demo-user',
      email: 'guest@drivelogic.ai',
      displayName: 'Guest Driver',
      isDemo: true
    } as any);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center max-w-md mx-auto bg-car-bg text-white">
        <p className="text-sm font-mono animate-pulse">Initializing System...</p>
      </div>
    );
  }

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center max-w-md mx-auto bg-car-bg shadow-2xl p-6 text-center animate-fade-in relative overflow-hidden">
        {/* Glow decorative effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-car-accent/10 rounded-full blur-3xl pointer-events-none" />
        
        <h1 className="text-3xl font-bold tracking-tighter text-white mb-2 relative z-10">DriveLogicAI</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-mono mb-8 relative z-10">Advanced Vehicle Intelligence</p>
        
        <div className="w-full max-w-sm space-y-6 relative z-10">
          <form onSubmit={handleEmailPasswordAuth} className="glass-card p-6 rounded-3xl border border-white/10 text-left space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/80 font-mono text-center">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </h3>
            
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-car-accent transition-colors text-white"
                required
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-car-accent transition-colors text-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isAuthActionLoading}
              className="w-full py-3 bg-gradient-to-r from-car-accent to-car-accent/80 hover:brightness-110 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all uppercase tracking-wider font-mono flex items-center justify-center gap-2 cursor-pointer animate-none"
            >
              {isAuthActionLoading ? (
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : authMode === 'login' ? 'SIGN IN' : 'REGISTER'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-[11px] text-car-accent hover:underline font-mono cursor-pointer bg-transparent border-none p-0 outline-none"
              >
                {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink mx-4 text-[10px] text-white/20 font-mono uppercase">or</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white text-black py-3.5 rounded-2xl font-semibold hover:bg-gray-100 transition-colors cursor-pointer text-sm"
            >
              Sign in with Google
            </button>

            <button
              onClick={handleDemoLogin}
              className="w-full flex items-center justify-center gap-3 bg-white/5 text-white/80 border border-white/10 py-3 rounded-2xl font-semibold hover:bg-white/10 transition-all cursor-pointer text-xs font-mono uppercase tracking-wider"
            >
              Continue in Demo Mode
            </button>
          </div>

          {(loginError || isInIframe) && (
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left space-y-2">
              <div className="flex gap-2 items-start text-car-accent">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Authentication Alert</span>
              </div>
              <p className="text-[10px] text-white/60 leading-relaxed">
                {loginError || "This application is currently running in a preview iframe. Browsers block Google sign-in popups and cookies inside cross-origin frames. Use Email login, Demo Mode above, or open in a new tab."}
              </p>
              {isInIframe && !loginError && (
                <button
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="w-full py-2 rounded-xl bg-car-accent/25 hover:bg-car-accent/40 border border-car-accent/30 text-car-accent text-[9px] font-mono font-bold transition-all uppercase tracking-wider cursor-pointer text-center"
                >
                  Open in New Tab
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-car-bg shadow-2xl overflow-hidden">
      {/* Header */}
      <motion.header 
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, info) => {
          if (info.offset.x < -50) {
            chatAssistantRef.current?.toggleMic();
          }
        }}
        className="p-6 pt-8 flex justify-between items-center border-b border-white/5 bg-car-card/50 backdrop-blur-md sticky top-0 z-50 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-3">
          <div className="relative group">
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
            >
              <Settings size={20} />
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-black text-white text-[10px] uppercase tracking-wider rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {vehicleModel ? `Vehicle: ${vehicleModel}` : 'Configure Vehicle'}
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-white">DriveLogicAI</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">Advanced Vehicle Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setNavigation({ ...navigation, isActive: !navigation.isActive, from: navigation.from || 'Current Location' })}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
              navigation.isActive 
                ? "bg-car-success/20 text-car-success border-car-success/30 animate-pulse" 
                : "bg-white/5 text-white/40 border-white/10 hover:text-white"
            )}
            title="Toggle GPS & Navigation"
          >
            <MapIcon size={12} />
            {navigation.isActive ? 'GPS ON' : 'GPS TRACKING'}
          </button>
          
          {isRecording ? (
            <button 
              onClick={stopTrip}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-car-danger/20 text-car-danger border border-car-danger/30 text-xs font-medium animate-pulse"
            >
              <Square size={12} fill="currentColor" />
              RECORDING
            </button>
          ) : (
            <button 
              onClick={startTrip}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-car-accent/20 text-car-accent border border-car-accent/30 text-xs font-medium"
            >
              <Play size={12} fill="currentColor" />
              START TRIP
            </button>
          )}
        </div>
      </motion.header>

      {criticalTasks.length > 0 && (
        <div 
          onClick={() => setActiveTab('maintenance')}
          className="bg-car-danger/20 border-b border-car-danger/30 p-3 flex items-center gap-3 cursor-pointer hover:bg-car-danger/30 transition-colors"
        >
          <AlertTriangle size={16} className="text-car-danger shrink-0" />
          <p className="text-xs text-car-danger font-medium flex-1">
            {criticalTasks.length} maintenance task{criticalTasks.length > 1 ? 's' : ''} due!
          </p>
          <ChevronRight size={16} className="text-car-danger/50" />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-4"
          >
            {activeTab === 'obd' && (
              <OBDTab 
                data={obdData} 
                isSimulation={isSimulation} 
                connectionStatus={connectionStatus}
                onConnectReal={connectToOBD} 
                onConnectSerial={connectToSerialOBD}
                sensorHistory={sensorHistory}
                diagnosis={diagnosis}
                onSetDiagnosis={setDiagnosis}
                isAnalyzing={isAnalyzing}
                onSetIsAnalyzing={setIsAnalyzing}
                isSubscribed={isSubscribed}
                onShowPaywall={() => setShowPaywall(true)}
                totalMileage={totalMileage}
                vehicleModel={vehicleModel}
              />
            )}
            {activeTab === 'damage' && (
              <DamageLogTab 
                score={damageScore} 
                history={damageHistory} 
                sensorHistory={sensorHistory}
                trips={trips} 
                isRecording={isRecording}
                mapsApiKey={apiKeys.maps}
                isLoaded={isLoaded}
                onUpdateTrip={(updatedTrip) => {
                  setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
                }}
              />
            )}
            {activeTab === 'gps' && (
              <GPSTab 
                isRecording={isRecording} 
                trips={trips} 
                navigation={navigation}
                setNavigation={setNavigation}
                mapsApiKey={apiKeys.maps}
                isLoaded={isLoaded}
              />
            )}
            {activeTab === 'maintenance' && (
              <MaintenanceTab 
                tasks={maintenanceTasks}
                totalMileage={totalMileage}
                onCompleteTask={(id) => {
                  setMaintenanceTasks(prev => prev.map(t => 
                    t.id === id ? { ...t, lastCompletedMiles: totalMileage, lastCompletedDate: Date.now() } : t
                  ));
                }}
                onAddTask={(task) => {
                  setMaintenanceTasks(prev => [...prev, { ...task, id: Math.random().toString(36).substr(2, 9) }]);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <FloatingMap navigation={navigation} setNavigation={setNavigation} mapsApiKey={apiKeys.maps} isLoaded={isLoaded} />

      <ChatAssistant 
        ref={chatAssistantRef}
        onTabChange={(tab) => setActiveTab(tab as any)}
        onSetNavigation={(from, to) => setNavigation({ from, to, isActive: true })}
        onDiagnose={handleAIDiagnosis}
        onToggleRecording={(start) => setIsRecording(start)}
        speed={obdData.speed}
        rpm={obdData.rpm}
        isRecording={isRecording}
        postCommandActions={postCommandActions}
        isSimulation={isSimulation}
        onSetSimulation={setIsSimulation}
      />
      
      <LiveChatAssistant 
        speed={obdData.speed}
        rpm={obdData.rpm}
        isRecording={isRecording}
        onTabChange={(tab: any) => setActiveTab(tab)}
        onSetNavigation={(from: any, to: any) => setNavigation({ from, to, isActive: true })}
        onDiagnose={handleAIDiagnosis}
        onToggleRecording={(start: any) => setIsRecording(start)}
        postCommandActions={postCommandActions}
        isSimulation={isSimulation}
        onSetSimulation={setIsSimulation}
      />

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md glass-card p-6 rounded-3xl space-y-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-car-accent/10 rounded-xl">
                    <Settings className="text-car-accent" size={20} />
                  </div>
                  <h2 className="text-xl font-bold">Settings</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full hover:bg-white/5 text-white/40"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono flex items-center gap-2">
                      <Key size={10} />
                      Gemini API Key
                    </label>
                  </div>
                  <input 
                    type="password"
                    value={apiKeys.gemini}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                    placeholder="Enter Gemini API Key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-car-accent transition-colors"
                  />
                  <p className="text-[8px] text-white/20">Default: Environment Variable</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono flex items-center gap-2">
                      <Key size={10} />
                      Google Maps API Key
                    </label>
                  </div>
                  <input 
                    type="password"
                    value={apiKeys.maps}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, maps: e.target.value }))}
                    placeholder="Enter Maps API Key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-car-accent transition-colors"
                  />
                  <p className="text-[8px] text-white/20">
                    {apiKeys.maps !== DEFAULT_MAPS_KEY ? "Key configured" : "Default: System Key (Restricted)"}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono flex items-center gap-2">
                      <Wrench size={10} />
                      Vehicle Selection
                    </label>
                  </div>
                  <input 
                    type="text"
                    value={vehicleModel}
                    onChange={(e) => {
                      setVehicleModel(e.target.value);
                      localStorage.setItem('ztcd_vehicle_model', e.target.value);
                    }}
                    placeholder="e.g., 2023 Toyota Camry"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-car-accent transition-colors text-white"
                  />
                  <p className="text-[8px] text-white/20">Used for AI diagnostics context</p>
                </div>

                {/* Premium Subscription Panel */}
                <div className="space-y-3 bg-gradient-to-br from-amber-500/10 to-car-accent/15 p-4 rounded-xl border border-amber-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] uppercase tracking-widest font-mono text-white/80 flex items-center gap-1.5 font-bold">
                      <Sparkles size={12} className="text-amber-400 animate-pulse" />
                      Premium Account Tier
                    </h3>
                    {isSubscribed ? (
                      <span className="text-[9px] bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1 font-bold">
                        PREMIUM
                      </span>
                    ) : (
                      <span className="text-[9px] bg-white/5 border border-white/10 text-white/40 px-2.5 py-0.5 rounded-full font-mono">
                        FREE TIER
                      </span>
                    )}
                  </div>

                  {isSubscribed ? (
                    <div className="space-y-2">
                      <p className="text-[10px] text-white/60 leading-relaxed">
                        Thank you for being a Premium subscriber! You have unlimited, ad-free access to Gemini 1.5 Pro AI vehicle diagnostics, detailed trouble definitions, and custom mitigation timelines.
                      </p>
                      <button
                        onClick={handleUnsubscribeUser}
                        disabled={isSubscribing}
                        className="w-full py-2 px-3 bg-white/5 border border-white/10 hover:bg-car-danger/10 hover:text-car-danger hover:border-car-danger/20 text-white/60 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isSubscribing ? (
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          "CANCEL SUBSCRIPTION"
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[10px] text-white/60 leading-relaxed">
                        Upgrade to Premium to unlock full deep AI vehicle diagnosis reports, driving habit telemetry correlation, and printable fault mitigation schedules.
                      </p>
                      <button
                        onClick={handleSubscribeUser}
                        disabled={isSubscribing}
                        className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-car-accent hover:brightness-110 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-lg shadow-car-accent/15 font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isSubscribing ? (
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Sparkles size={14} className="text-amber-200" />
                            SUBSCRIBE FOR $9.99/MO
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10">
                  <h3 className="text-[10px] uppercase tracking-widest font-mono text-white/60">Voice Command Actions</h3>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-white/40 font-mono">On Tab Switch</label>
                      <select
                        value={postCommandActions.changeTab}
                        onChange={(e) => setPostCommandActions(prev => ({ ...prev, changeTab: e.target.value as any }))}
                        className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                      >
                        <option value="none">Do Nothing</option>
                        <option value="speakTab">Speak Tab Title</option>
                        <option value="triggerSim">Toggle OBD Sim</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-white/40 font-mono">On Navigation Set</label>
                      <select
                        value={postCommandActions.setNavigation}
                        onChange={(e) => setPostCommandActions(prev => ({ ...prev, setNavigation: e.target.value as any }))}
                        className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                      >
                        <option value="none">Do Nothing</option>
                        <option value="autoRecord">Auto-Record Trip</option>
                        <option value="switchTab">Show GPS Tab</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-white/40 font-mono">On Diagnose Run</label>
                      <select
                        value={postCommandActions.diagnoseVehicle}
                        onChange={(e) => setPostCommandActions(prev => ({ ...prev, diagnoseVehicle: e.target.value as any }))}
                        className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                      >
                        <option value="none">Do Nothing</option>
                        <option value="switchOBD">Show OBD Tab</option>
                        <option value="speakHealth">Speak Health Index</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-white/40 font-mono">On Recording Toggle</label>
                      <select
                        value={postCommandActions.toggleRecording}
                        onChange={(e) => setPostCommandActions(prev => ({ ...prev, toggleRecording: e.target.value as any }))}
                        className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 font-mono text-[10px] text-white focus:outline-none focus:border-car-accent transition-colors"
                      >
                        <option value="none">Do Nothing</option>
                        <option value="switchGPS">Show GPS Tab</option>
                        <option value="speakStatus">Speak Status</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 bg-white/5 p-4 rounded-xl border border-white/10">
                  <h3 className="text-[10px] uppercase tracking-widest font-mono text-white/60 mb-2">Base Voice Commands</h3>
                  <ul className="text-[10px] space-y-1.5 text-white/40 list-disc list-inside">
                    <li><strong className="text-white/80">"Hey Drive logic"</strong> - Start listening manually</li>
                    <li><strong className="text-white/80">"Show me my maintenance tasks"</strong> - Switch tabs</li>
                    <li><strong className="text-white/80">"Diagnose my vehicle"</strong> - Run AI diagnostics</li>
                    <li><strong className="text-white/80">"Start recording"</strong> / <strong className="text-white/80">"Stop recording"</strong> - Trip logging</li>
                    <li><strong className="text-white/80">"Navigate from [A] to [B]"</strong> - Set GPS route</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      localStorage.removeItem('ztcd_maps_api_key');
                      localStorage.removeItem('ztcd_gemini_api_key');
                      window.location.reload();
                    }}
                    className="w-1/3 py-3 bg-white/5 border border-white/10 text-white/60 rounded-xl font-bold text-[10px] uppercase hover:bg-white/10 hover:text-white transition-all"
                  >
                    Reset Keys
                  </button>
                  <button 
                    onClick={saveApiKeys}
                    className="w-2/3 py-3 bg-car-accent text-white rounded-xl font-bold text-sm hover:bg-car-accent/80 transition-all"
                  >
                    SAVE CONFIGURATION
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (user && (user as any).isDemo) {
                      setUser(null);
                    } else {
                      signOut(auth);
                    }
                  }}
                  className="w-full py-3 mt-4 bg-car-danger/20 border border-car-danger/30 text-car-danger rounded-xl font-bold text-sm hover:bg-car-danger/30 transition-all"
                >
                  SIGN OUT
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Premium Paywall Modal */}
      <AnimatePresence>
        {showPaywall && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-gradient-to-br from-car-card to-[#0d0e12] border border-amber-500/30 p-6 rounded-3xl space-y-6 relative overflow-hidden text-center"
            >
              {/* Decorative radial glows */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-car-accent/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex justify-end absolute top-4 right-4 z-10">
                <button 
                  onClick={() => setShowPaywall(false)}
                  className="p-2 rounded-full hover:bg-white/5 text-white/40 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2 pt-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-car-accent flex items-center justify-center text-white shadow-lg shadow-car-accent/20 animate-bounce">
                  <Sparkles size={24} />
                </div>
                <h2 className="text-xl font-extrabold tracking-tight text-white">DriveLogicAI Premium</h2>
                <p className="text-xs text-white/40 font-mono uppercase tracking-[0.2em]">Vehicle Intelligence Upgrade</p>
              </div>

              <div className="space-y-4 text-left bg-white/5 p-4 rounded-2xl border border-white/5">
                <h3 className="text-[10px] uppercase tracking-widest text-amber-400 font-mono font-bold">Premium Benefits Included:</h3>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-amber-500/15 rounded-lg text-amber-400 shrink-0 mt-0.5">
                      <Sparkles size={14} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-none">Unlimited Gemini Diagnostics</h4>
                      <p className="text-[10px] text-white/60 leading-relaxed mt-1">Get instant, smart fault interpretations and step-by-step diagnostic correlations.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-car-accent/15 rounded-lg text-car-accent shrink-0 mt-0.5">
                      <CreditCard size={14} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-none">Mitigation Schedules</h4>
                      <p className="text-[10px] text-white/60 leading-relaxed mt-1">Receive customized maintenance timelines and printable service lists.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-car-cyan/15 rounded-lg text-car-cyan shrink-0 mt-0.5">
                      <Lock size={14} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-none">Real-Time Fault Correlation</h4>
                      <p className="text-[10px] text-white/60 leading-relaxed mt-1">Correlate sensor telemetry histories with dashboard symbols to prevent damage.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300">Monthly Premium Plan</span>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-extrabold text-white">$9.99</span>
                  <span className="text-xs text-white/40">/ month</span>
                </div>
                <p className="text-[9px] text-white/30">Cancel anytime under Settings modal. Secure checkout.</p>
              </div>

              <button
                onClick={handleSubscribeUser}
                disabled={isSubscribing}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-car-accent to-car-accent/80 hover:brightness-110 active:scale-[0.98] text-white text-xs font-bold rounded-2xl shadow-xl shadow-car-accent/15 tracking-wider uppercase font-mono transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubscribing ? (
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Sparkles size={14} />
                    ACTIVATE PREMIUM NOW
                  </>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-car-card/80 backdrop-blur-xl border-t border-white/5 p-2 flex justify-around items-center z-50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 transition-all duration-300 rounded-xl flex-1",
                isActive ? "text-car-accent bg-car-accent/5" : "text-white/40 hover:text-white/60"
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{tab.id}</span>
              {isActive && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute -top-2 w-1 h-1 bg-car-accent rounded-full"
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
