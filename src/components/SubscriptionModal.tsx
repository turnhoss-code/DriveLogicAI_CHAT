import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Star, Zap } from 'lucide-react';
import { Tier, UserProfile } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onUpgrade: (tier: Tier) => void;
}

export default function SubscriptionModal({ isOpen, onClose, userProfile, onUpgrade }: Props) {
  if (!isOpen) return null;

  const currentTier = userProfile?.tier || 'free';

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="w-full max-w-lg glass-card p-6 rounded-3xl space-y-6"
        >
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-car-accent/10 rounded-xl">
                <Star className="text-car-accent" size={20} />
              </div>
              <h2 className="text-2xl font-bold">Upgrade Your Drive</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-white/40">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PREMIUM TIER */}
            <div className={`p-4 rounded-2xl border ${currentTier === 'premium' ? 'border-car-accent bg-car-accent/10' : 'border-white/10 bg-white/5'}`}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold text-white">Premium</h3>
                {currentTier === 'premium' && <span className="text-[10px] bg-car-accent text-white px-2 py-1 rounded-full uppercase">Current</span>}
              </div>
              <p className="text-2xl font-bold mb-4">$4.99 <span className="text-sm text-white/40 font-normal">/mo</span></p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-sm text-white/80"><Check size={14} className="text-car-success" /> No Ads</li>
                <li className="flex items-center gap-2 text-sm text-white/80"><Check size={14} className="text-car-success" /> Google Drive Sync</li>
                <li className="flex items-center gap-2 text-sm text-white/80"><Check size={14} className="text-car-success" /> 50 AI Tokens / month</li>
              </ul>
              <button 
                disabled={currentTier === 'premium'}
                onClick={() => { onUpgrade('premium'); onClose(); }}
                className={`w-full py-3 rounded-xl font-bold transition-all ${currentTier === 'premium' ? 'bg-white/10 text-white/40' : 'bg-car-accent text-white hover:bg-car-accent/80'}`}
              >
                {currentTier === 'premium' ? 'Active' : 'Upgrade Premium'}
              </button>
            </div>

            {/* PRO TIER */}
            <div className={`p-4 rounded-2xl border relative overflow-hidden ${currentTier === 'pro' ? 'border-car-warning bg-car-warning/10' : 'border-white/10 bg-white/5'}`}>
              <div className="absolute top-0 right-0 bg-car-warning text-black text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase">Best Value</div>
              <div className="flex justify-between items-center mb-2 mt-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Zap size={16} className="text-car-warning" /> PRO</h3>
                {currentTier === 'pro' && <span className="text-[10px] bg-car-warning text-black px-2 py-1 rounded-full uppercase">Current</span>}
              </div>
              <p className="text-2xl font-bold mb-4">$9.99 <span className="text-sm text-white/40 font-normal">/mo</span></p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-sm text-white/80"><Check size={14} className="text-car-warning" /> All Premium Features</li>
                <li className="flex items-center gap-2 text-sm text-white/80"><Check size={14} className="text-car-warning" /> <b>Unlimited</b> AI Tokens</li>
                <li className="flex items-center gap-2 text-sm text-white/80"><Check size={14} className="text-car-warning" /> Priority Live Chat</li>
              </ul>
              <button 
                disabled={currentTier === 'pro'}
                onClick={() => { onUpgrade('pro'); onClose(); }}
                className={`w-full py-3 rounded-xl font-bold transition-all ${currentTier === 'pro' ? 'bg-white/10 text-white/40' : 'bg-car-warning text-black hover:bg-car-warning/80'}`}
              >
                {currentTier === 'pro' ? 'Active' : 'Upgrade PRO'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
