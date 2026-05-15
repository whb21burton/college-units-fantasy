'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'

interface IntroAnimationProps {
  onComplete: () => void
}

export default function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const [phase, setPhase] = useState<'fog' | 'impact' | 'shatter' | 'reveal' | 'done'>('fog')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [particles, setParticles] = useState<Array<{
    id: number; x: number; y: number; vx: number; vy: number;
    size: number; rotation: number; opacity: number; color: string
  }>>([])
  const audioCtx = useRef<AudioContext | null>(null)
  const controls = useAnimation()

  // Generate debris particles
  useEffect(() => {
    const pts = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: 45 + Math.random() * 10,
      y: 45 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 180,
      vy: (Math.random() - 0.5) * 180 - 40,
      size: 4 + Math.random() * 14,
      rotation: Math.random() * 360,
      opacity: 0.7 + Math.random() * 0.3,
      color: ['#f5a623', '#ffffff', '#888888', '#444444', '#cc8800'][Math.floor(Math.random() * 5)]
    }))
    setParticles(pts)
  }, [])

  // Cinematic timeline
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('impact'), 600)
    const t2 = setTimeout(() => setPhase('shatter'), 900)
    const t3 = setTimeout(() => setPhase('reveal'), 1300)
    const t4 = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, 2800)
    return () => [t1, t2, t3, t4].forEach(clearTimeout)
  }, [onComplete])

  // Screen shake
  useEffect(() => {
    if (phase === 'impact') {
      controls.start({
        x: [0, -12, 10, -8, 6, -4, 2, 0],
        y: [0, 8, -6, 4, -3, 2, -1, 0],
        transition: { duration: 0.5, ease: 'easeOut' }
      })
    }
  }, [phase, controls])

  // Web Audio API impact sound
  function playImpact() {
    if (!soundEnabled) return
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtx.current = ctx

      // Bass thud
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(80, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.4)
      gain.gain.setValueAtTime(0.8, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)

      // Crack/noise burst
      const bufferSize = ctx.sampleRate * 0.3
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 3000)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(0.4, ctx.currentTime)
      source.connect(noiseGain)
      noiseGain.connect(ctx.destination)
      source.start(ctx.currentTime)
    } catch (e) {}
  }

  useEffect(() => {
    if (phase === 'impact') playImpact()
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'done') return null

  return (
    <motion.div
      animate={controls}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: '#000', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Sound toggle */}
      <button
        onClick={() => setSoundEnabled(s => !s)}
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          color: '#fff', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
        }}
      >
        {soundEnabled ? '🔊' : '🔇'}
      </button>

      {/* Background fog/smoke layers */}
      <AnimatePresence>
        {['fog', 'impact', 'shatter', 'reveal'].includes(phase) && (
          <>
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={`fog-${i}`}
                initial={{ opacity: 0, scale: 0.5, x: (i % 2 === 0 ? -1 : 1) * 200 }}
                animate={{
                  opacity: phase === 'reveal' ? 0 : [0, 0.15, 0.08],
                  scale: [0.5, 2.5, 4],
                  x: (i % 2 === 0 ? -1 : 1) * (100 + i * 30),
                }}
                transition={{ duration: 2.5, delay: i * 0.1, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  width: 400 + i * 80,
                  height: 400 + i * 80,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, rgba(${i % 2 === 0 ? '245,166,35' : '100,100,100'},0.3) 0%, transparent 70%)`,
                  filter: 'blur(40px)',
                  pointerEvents: 'none',
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Wall/surface that gets broken */}
      <AnimatePresence>
        {(phase === 'fog' || phase === 'impact') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'impact' ? 1 : 0.3 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #000 100%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Wall crack lines */}
      <AnimatePresence>
        {(phase === 'impact' || phase === 'shatter') && (
          <motion.svg
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {[
              'M 50% 50% L 20% 10%', 'M 50% 50% L 80% 15%',
              'M 50% 50% L 5% 60%',  'M 50% 50% L 95% 55%',
              'M 50% 50% L 30% 95%', 'M 50% 50% L 70% 90%',
              'M 50% 50% L 15% 40%', 'M 50% 50% L 85% 35%',
            ].map((d, i) => (
              <motion.line
                key={i}
                x1="50%" y1="50%"
                x2={`${parseInt(d.split('L ')[1])}%`}
                y2={`${parseInt(d.split(' ')[d.split(' ').length - 1])}%`}
                stroke={i % 3 === 0 ? '#f5a623' : '#ffffff'}
                strokeWidth={i % 2 === 0 ? '2' : '1'}
                strokeOpacity="0.6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.7 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              />
            ))}
          </motion.svg>
        )}
      </AnimatePresence>

      {/* Flash on impact */}
      <AnimatePresence>
        {phase === 'impact' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 50% 50%, rgba(255,200,50,0.95) 0%, rgba(255,100,0,0.4) 40%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Debris particles */}
      <AnimatePresence>
        {(phase === 'shatter' || phase === 'reveal') && particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ x: `${p.x}vw`, y: `${p.y}vh`, opacity: p.opacity, rotate: 0, scale: 1 }}
            animate={{
              x: `${p.x + p.vx * 0.3}vw`,
              y: `${p.y + p.vy * 0.3}vh`,
              opacity: 0,
              rotate: p.rotation * 3,
              scale: [1, 1.5, 0.5],
            }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size * (0.5 + Math.random() * 0.5),
              background: p.color,
              borderRadius: Math.random() > 0.5 ? '2px' : '50%',
              pointerEvents: 'none',
              boxShadow: p.color === '#f5a623' ? `0 0 ${p.size * 2}px ${p.color}` : 'none',
            }}
          />
        ))}
      </AnimatePresence>

      {/* LOGO — breaks through */}
      <motion.div
        initial={{ scale: 3, opacity: 0, filter: 'brightness(5) blur(10px)' }}
        animate={{
          scale: phase === 'fog' ? 3 : phase === 'impact' ? 1.15 : phase === 'shatter' ? 1.05 : 1,
          opacity: phase === 'fog' ? 0 : 1,
          filter: phase === 'fog' ? 'brightness(5) blur(10px)'
            : phase === 'impact'  ? 'brightness(3) blur(2px) drop-shadow(0 0 40px #f5a623)'
            : phase === 'shatter' ? 'brightness(2) drop-shadow(0 0 60px #f5a623) drop-shadow(0 0 30px #fff)'
            : 'brightness(1) drop-shadow(0 0 20px rgba(245,166,35,0.6))',
        }}
        transition={{
          scale:   { duration: 0.4, ease: 'easeOut' },
          opacity: { duration: 0.15 },
          filter:  { duration: 0.4 },
        }}
        style={{ position: 'relative', zIndex: 5 }}
      >
        <img
          src="/logo.png"
          alt="College Units Fantasy"
          style={{
            width: 'min(220px, 55vw)',
            height: 'auto',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </motion.div>

      {/* Gold glow ring around logo */}
      <AnimatePresence>
        {(phase === 'shatter' || phase === 'reveal') && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 2.5, 1.2], opacity: [0, 0.8, 0] }}
            transition={{ duration: 1.0, ease: 'easeOut' }}
            style={{
              position: 'absolute', zIndex: 4,
              width: 'min(300px, 75vw)',
              height: 'min(300px, 75vw)',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(245,166,35,0.4) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Tagline fade in */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{
              position: 'absolute',
              bottom: '28%',
              fontFamily: 'Oswald,sans-serif',
              fontSize: 'clamp(11px, 3vw, 14px)',
              letterSpacing: 6,
              color: 'rgba(245,166,35,0.8)',
              textTransform: 'uppercase',
              pointerEvents: 'none',
            }}
          >
            Draft · Compete · Dominate
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fade to page */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.0 }}
            style={{
              position: 'absolute', inset: 0,
              background: '#070a12',
              pointerEvents: 'none',
              zIndex: 6,
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
