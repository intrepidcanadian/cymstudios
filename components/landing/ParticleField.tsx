'use client'

import { useEffect, useRef } from 'react'

/**
 * Generative particle canvas — fixed, full-viewport, behind all content.
 * Renders connected dots that drift and trace faint lines to nearby neighbors.
 */
export default function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0
    let pts: Array<{ x: number; y: number; vx: number; vy: number; r: number }> = []
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

    const resize = () => {
      W = canvas.width = window.innerWidth * dpr
      H = canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      const count = Math.floor((W * H) / 38000)
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15 * dpr,
        vy: (Math.random() - 0.5) * 0.15 * dpr,
        r: Math.random() * 1.2 * dpr + 0.3 * dpr,
      }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      // Lines between nearby points
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]
          const b = pts[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < 140 * dpr) {
            ctx.strokeStyle = `rgba(220,220,230,${(1 - d / (140 * dpr)) * 0.18})`
            ctx.lineWidth = 0.5 * dpr
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }
      // Dots
      ctx.fillStyle = 'rgba(230,230,240,0.6)'
      for (const p of pts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > W) p.vx *= -1
        if (p.y < 0 || p.y > H) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      frameRef.current = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    draw()

    return () => {
      window.removeEventListener('resize', resize)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
