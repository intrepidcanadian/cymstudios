'use client'

import { useEffect, useRef } from 'react'
import styles from './StudioCanvas.module.css'

interface Player {
  x: number
  y: number
  width: number
  height: number
  speed: number
  direction: 'up' | 'down' | 'left' | 'right'
}

interface StudioObject {
  x: number
  y: number
  width: number
  height: number
  color: string
  label: string
  border?: boolean
  isTV?: boolean
  videoId?: string
}

interface StudioCanvasProps {
  onVideoTrigger?: (videoId: string, description: string) => void
}

export default function StudioCanvas({ onVideoTrigger }: StudioCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Responsive player size
  const getPlayerSize = () => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
    return isMobile ? { width: 30, height: 45 } : { width: 40, height: 60 }
  }
  
  const playerRef = useRef<Player>({
    x: 0,
    y: 0,
    width: 40,
    height: 60,
    speed: 5, // Increased for faster movement
    direction: 'down'
  })
  const keysRef = useRef<{ [key: string]: boolean }>({})
  const animationFrameRef = useRef<number>()
  const lastTriggerRef = useRef<string | null>(null)
  const starsRef = useRef<{ x: number, y: number, size: number, opacity: number }[]>([])
  const logoRef = useRef<HTMLImageElement | null>(null)
  const mouseRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 })
  const asteroidsRef = useRef<{ x: number, y: number, vx: number, vy: number, size: number, rotation: number, rotationSpeed: number }[]>([])
  const shieldHitsRef = useRef<{ angle: number, time: number }[]>([])
  const lasersRef = useRef<{ x: number, y: number, vx: number, vy: number }[]>([])
  const explosionsRef = useRef<{ x: number, y: number, time: number }[]>([])
  const lastAsteroidTimeRef = useRef<number>(0)
  const gunAngleRef = useRef<number>(0)
  const OUTER_BOUNDARY_REF = useRef<number>(350)
  const GUN_RADIUS = 100 // Distance of gun from center
  const hoveredTVRef = useRef<number | null>(null) // Track which TV is hovered
  const previousHoveredTVRef = useRef<number | null>(null) // Track previous hover state

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Auto-focus canvas so keyboard events work immediately
    canvas.focus()

    // Load logo image
    const logo = new Image()
    logo.src = '/cym.png'
    logo.onload = () => {
      logoRef.current = logo
    }

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      // Position avatar slightly to the left of center (logo position)
      playerRef.current.x = canvas.width / 2 - 80
      playerRef.current.y = canvas.height / 2
      
      // Responsive player size
      const playerSize = getPlayerSize()
      playerRef.current.width = playerSize.width
      playerRef.current.height = playerSize.height
      
      // Responsive boundary size based on screen size
      const minDimension = Math.min(canvas.width, canvas.height)
      OUTER_BOUNDARY_REF.current = Math.min(350, minDimension * 0.4)
      
      // Generate stars
      if (starsRef.current.length === 0) {
        generateStars()
      }
    }
    
    // Generate random stars in space
    const generateStars = () => {
      const stars = []
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.8 + 0.2
        })
      }
      starsRef.current = stars
    }

    // Generate asteroid from random edge
    const generateAsteroid = () => {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const side = Math.floor(Math.random() * 4) // 0=top, 1=right, 2=bottom, 3=left
      let x, y, vx, vy
      
      switch(side) {
        case 0: // top
          x = Math.random() * canvas.width
          y = -50
          vx = (centerX - x) / 350 + (Math.random() - 0.5) * 0.5
          vy = (centerY - y) / 350 + Math.random() * 0.5
          break
        case 1: // right
          x = canvas.width + 50
          y = Math.random() * canvas.height
          vx = (centerX - x) / 350 - Math.random() * 0.5
          vy = (centerY - y) / 350 + (Math.random() - 0.5) * 0.5
          break
        case 2: // bottom
          x = Math.random() * canvas.width
          y = canvas.height + 50
          vx = (centerX - x) / 350 + (Math.random() - 0.5) * 0.5
          vy = (centerY - y) / 350 - Math.random() * 0.5
          break
        default: // left
          x = -50
          y = Math.random() * canvas.height
          vx = (centerX - x) / 350 + Math.random() * 0.5
          vy = (centerY - y) / 350 + (Math.random() - 0.5) * 0.5
      }
      
      asteroidsRef.current.push({
        x, y, vx, vy,
        size: Math.random() * 20 + 15,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1
      })
    }
    
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Calculate center of canvas
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const OUTER_BOUNDARY = OUTER_BOUNDARY_REF.current
    const radius = 250 // Distance from center to TVs
    const isMobile = Math.min(canvas.width, canvas.height) < 600
    
    // Studio objects - 4 curved TV screens on the hull (using angle and arc length)
    const studioObjects: StudioObject[] = [
      // TV 1 - Top (12 o'clock)
      { 
        x: centerX, 
        y: centerY - OUTER_BOUNDARY, 
        width: 0.5, // This will be the arc angle in radians
        height: 40, // Hull thickness
        color: '#1a1a1a', 
        label: '2025 2v2 Random Starcraft Brood War Tournament ($500 Prize Pool)', 
        isTV: true, 
        videoId: 'NTiKNaKZAF8', 
        border: true 
      },
      // TV 2 - Right (3 o'clock)
      { 
        x: centerX + OUTER_BOUNDARY, 
        y: centerY, 
        width: 0.5, 
        height: 40, 
        color: '#1a1a1a', 
        label: 'Season 3 Bombastic Starleague 2v2 Tournament ($1,000 Prize Pool)', 
        isTV: true, 
        videoId: 'Q82c39DQoJc', 
        border: true 
      },
      // TV 3 - Bottom (6 o'clock)
      { 
        x: centerX, 
        y: centerY + OUTER_BOUNDARY, 
        width: 0.5, 
        height: 40, 
        color: '#1a1a1a', 
        label: 'Bombastic Starleague Qualifications Season 3', 
        isTV: true, 
        videoId: '9RJzUTqOm5M', 
        border: true 
      },
      // TV 4 - Left (9 o'clock)
      { 
        x: centerX - OUTER_BOUNDARY, 
        y: centerY, 
        width: 0.5, 
        height: 40, 
        color: '#1a1a1a', 
        label: '2023 2v2 Shield Battery Tournament ($500 Prize Pool)', 
        isTV: true, 
        videoId: 's-l4dQm7-uc', 
        border: true 
      }
    ]

    // Check collision
    const checkCollision = (player: Player, obj: StudioObject): boolean => {
      return player.x - player.width / 2 < obj.x + obj.width &&
             player.x + player.width / 2 > obj.x &&
             player.y - player.height / 2 < obj.y + obj.height &&
             player.y + player.height / 2 > obj.y
    }

    // Check if player is near an object (for interaction) - updated for curved TVs
    const checkNearby = (player: Player, obj: StudioObject, distance: number = 150): boolean => {
      if (obj.isTV) {
        // For curved TVs, check distance from player to the TV position on hull
        const dist = Math.sqrt(Math.pow(player.x - obj.x, 2) + Math.pow(player.y - obj.y, 2))
        return dist < distance
      }
      const playerCenterX = player.x
      const playerCenterY = player.y
      const objCenterX = obj.x + obj.width / 2
      const objCenterY = obj.y + obj.height / 2
      const dist = Math.sqrt(Math.pow(playerCenterX - objCenterX, 2) + Math.pow(playerCenterY - objCenterY, 2))
      return dist < distance
    }

    // Update player position
    const updatePlayer = () => {
      const player = playerRef.current
      const keys = keysRef.current
      const oldX = player.x
      const oldY = player.y
      
      if (keys['ArrowUp'] || keys['w'] || keys['W']) {
        player.y -= player.speed
        player.direction = 'up'
      }
      if (keys['ArrowDown'] || keys['s'] || keys['S']) {
        player.y += player.speed
        player.direction = 'down'
      }
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        player.x -= player.speed
        player.direction = 'left'
      }
      if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        player.x += player.speed
        player.direction = 'right'
      }
      
      // Keep player within canvas bounds
      player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x))
      player.y = Math.max(player.height / 2, Math.min(canvas.height - player.height / 2, player.y))
      
      // Keep player within the outer circle (spaceship boundary)
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const distanceFromCenter = Math.sqrt(
        Math.pow(player.x - centerX, 2) + Math.pow(player.y - centerY, 2)
      )
      
      if (distanceFromCenter > OUTER_BOUNDARY - player.width / 2) {
        // Push player back to the boundary
        const angle = Math.atan2(player.y - centerY, player.x - centerX)
        player.x = centerX + Math.cos(angle) * (OUTER_BOUNDARY - player.width / 2)
        player.y = centerY + Math.sin(angle) * (OUTER_BOUNDARY - player.width / 2)
      }
      
      // Auto-trigger video when approaching TVs
      let videoTriggered = false
      for (let obj of studioObjects) {
        if (obj.isTV && obj.videoId && checkNearby(player, obj, 150)) {
          if (lastTriggerRef.current !== obj.videoId) {
            lastTriggerRef.current = obj.videoId
            if (onVideoTrigger) {
              onVideoTrigger(obj.videoId, obj.label)
            }
          }
          videoTriggered = true
          break
        }
      }
      
      // Reset trigger when not near any TV
      if (!videoTriggered) {
        lastTriggerRef.current = null
      }
    }

    // Update lasers
    const updateLasers = () => {
      const currentTime = Date.now()
      
      // Update laser positions
      lasersRef.current = lasersRef.current.filter(laser => {
        laser.x += laser.vx
        laser.y += laser.vy
        
        // Check collision with asteroids
        for (let i = 0; i < asteroidsRef.current.length; i++) {
          const asteroid = asteroidsRef.current[i]
          const dist = Math.sqrt(
            Math.pow(laser.x - asteroid.x, 2) + Math.pow(laser.y - asteroid.y, 2)
          )
          
          if (dist < asteroid.size) {
            // Hit! Create explosion and remove both
            explosionsRef.current.push({ 
              x: asteroid.x, 
              y: asteroid.y, 
              time: currentTime 
            })
            asteroidsRef.current.splice(i, 1)
            return false // Remove laser
          }
        }
        
        // Remove if off screen
        return laser.x > -50 && laser.x < canvas.width + 50 &&
               laser.y > -50 && laser.y < canvas.height + 50
      })
      
      // Clean up old explosions
      explosionsRef.current = explosionsRef.current.filter(exp =>
        currentTime - exp.time < 500
      )
    }

    // Update asteroids
    const updateAsteroids = () => {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const currentTime = Date.now()
      
      // Generate new asteroid every 3-6 seconds
      if (currentTime - lastAsteroidTimeRef.current > 3000 + Math.random() * 3000) {
        generateAsteroid()
        lastAsteroidTimeRef.current = currentTime
      }
      
      // Update existing asteroids
      asteroidsRef.current = asteroidsRef.current.filter(asteroid => {
        asteroid.x += asteroid.vx
        asteroid.y += asteroid.vy
        asteroid.rotation += asteroid.rotationSpeed
        
        // Check collision with outer boundary
        const distFromCenter = Math.sqrt(
          Math.pow(asteroid.x - centerX, 2) + Math.pow(asteroid.y - centerY, 2)
        )
        
        if (distFromCenter <= OUTER_BOUNDARY + asteroid.size / 2 && 
            distFromCenter >= OUTER_BOUNDARY - 20) {
          // Hit the shield! Create shield effect
          const angle = Math.atan2(asteroid.y - centerY, asteroid.x - centerX)
          shieldHitsRef.current.push({ angle, time: currentTime })
          return false // Remove asteroid
        }
        
        // Remove if too far from screen
        return asteroid.x > -100 && asteroid.x < canvas.width + 100 &&
               asteroid.y > -100 && asteroid.y < canvas.height + 100
      })
      
      // Clean up old shield hits (remove after 1 second)
      shieldHitsRef.current = shieldHitsRef.current.filter(hit => 
        currentTime - hit.time < 1000
      )
    }

    // Draw functions
    const drawStudio = () => {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const currentTime = Date.now() // Define once at the top
      const mouse = mouseRef.current
      
      // Draw space background (dark outer space)
      ctx.fillStyle = '#0a0a1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Draw stars
      starsRef.current.forEach(star => {
        const distFromCenter = Math.sqrt(
          Math.pow(star.x - centerX, 2) + Math.pow(star.y - centerY, 2)
        )
        
        // Only draw stars outside the spaceship
        if (distFromCenter > OUTER_BOUNDARY) {
          ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`
          ctx.beginPath()
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      
      // Draw spaceship interior (darker gradient inside the circle)
      const interiorGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, OUTER_BOUNDARY
      )
      interiorGradient.addColorStop(0, '#1a1a3e')
      interiorGradient.addColorStop(0.7, '#16213e')
      interiorGradient.addColorStop(1, 'rgba(22, 33, 62, 0)')
      
      ctx.fillStyle = interiorGradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, OUTER_BOUNDARY, 0, Math.PI * 2)
      ctx.fill()
      
      // Draw circular guide rings (spaceship aesthetic)
      ctx.strokeStyle = 'rgba(102, 126, 234, 0.2)'
      ctx.lineWidth = 2
      
      // Inner circle
      ctx.beginPath()
      ctx.arc(centerX, centerY, 150, 0, Math.PI * 2)
      ctx.stroke()
      
      // Middle circle (where TVs are)
      ctx.beginPath()
      ctx.arc(centerX, centerY, 250, 0, Math.PI * 2)
      ctx.stroke()
      
      // Outer circle
      ctx.beginPath()
      ctx.arc(centerX, centerY, 350, 0, Math.PI * 2)
      ctx.stroke()
      
      // Draw connecting lines from center to TVs (like spaceship spokes)
      ctx.strokeStyle = 'rgba(102, 126, 234, 0.15)'
      ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i - Math.PI / 2
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.lineTo(
          centerX + Math.cos(angle) * 350,
          centerY + Math.sin(angle) * 350
        )
        ctx.stroke()
      }
      
      // Draw shield hits
      shieldHitsRef.current.forEach(hit => {
        const age = currentTime - hit.time
        const opacity = 1 - (age / 1000) // Fade out over 1 second
        const size = 60 + (age / 1000) * 30 // Expand
        
        // Draw shield hexagon effect
        ctx.save()
        ctx.translate(
          centerX + Math.cos(hit.angle) * OUTER_BOUNDARY,
          centerY + Math.sin(hit.angle) * OUTER_BOUNDARY
        )
        
        ctx.strokeStyle = `rgba(102, 126, 234, ${opacity})`
        ctx.fillStyle = `rgba(102, 126, 234, ${opacity * 0.3})`
        ctx.lineWidth = 3
        
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const hexAngle = (Math.PI / 3) * i
          const x = Math.cos(hexAngle) * size
          const y = Math.sin(hexAngle) * size
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        
        ctx.restore()
      })
      
      // Draw gun turret
      const gunX = centerX + Math.cos(gunAngleRef.current) * GUN_RADIUS
      const gunY = centerY + Math.sin(gunAngleRef.current) * GUN_RADIUS
      
      ctx.save()
      ctx.translate(gunX, gunY)
      ctx.rotate(gunAngleRef.current)
      
      // Gun base
      ctx.fillStyle = '#667eea'
      ctx.beginPath()
      ctx.arc(0, 0, 15, 0, Math.PI * 2)
      ctx.fill()
      
      // Gun barrel
      ctx.fillStyle = '#4a5fd9'
      ctx.fillRect(0, -8, 30, 16)
      
      // Gun tip
      ctx.fillStyle = '#ffdd57'
      ctx.beginPath()
      ctx.arc(30, 0, 5, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.restore()
      
      // Draw crosshair at mouse position
      ctx.strokeStyle = 'rgba(255, 221, 87, 0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(mouse.x - 10, mouse.y)
      ctx.lineTo(mouse.x + 10, mouse.y)
      ctx.moveTo(mouse.x, mouse.y - 10)
      ctx.lineTo(mouse.x, mouse.y + 10)
      ctx.stroke()
      
      ctx.strokeStyle = 'rgba(255, 221, 87, 0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(mouse.x, mouse.y, 20, 0, Math.PI * 2)
      ctx.stroke()
      
      // Draw lasers
      lasersRef.current.forEach(laser => {
        ctx.strokeStyle = '#00ffff'
        ctx.lineWidth = 3
        ctx.shadowColor = '#00ffff'
        ctx.shadowBlur = 10
        
        ctx.beginPath()
        ctx.moveTo(laser.x, laser.y)
        ctx.lineTo(laser.x - laser.vx * 3, laser.y - laser.vy * 3)
        ctx.stroke()
        
        ctx.shadowBlur = 0
      })
      
      // Draw explosions
      explosionsRef.current.forEach(exp => {
        const age = currentTime - exp.time
        const progress = age / 500
        const size = 20 + progress * 40
        const opacity = 1 - progress
        
        ctx.fillStyle = `rgba(255, 100, 0, ${opacity})`
        ctx.beginPath()
        ctx.arc(exp.x, exp.y, size, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = `rgba(255, 200, 0, ${opacity * 0.8})`
        ctx.beginPath()
        ctx.arc(exp.x, exp.y, size * 0.6, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.6})`
        ctx.beginPath()
        ctx.arc(exp.x, exp.y, size * 0.3, 0, Math.PI * 2)
        ctx.fill()
      })
      
      // Draw asteroids
      asteroidsRef.current.forEach(asteroid => {
        ctx.save()
        ctx.translate(asteroid.x, asteroid.y)
        ctx.rotate(asteroid.rotation)
        
        // Draw irregular asteroid shape
        ctx.fillStyle = '#8B7355'
        ctx.strokeStyle = '#654321'
        ctx.lineWidth = 2
        
        ctx.beginPath()
        const points = 8
        for (let i = 0; i < points; i++) {
          const angle = (Math.PI * 2 / points) * i
          const radius = asteroid.size * (0.8 + Math.random() * 0.4)
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        
        // Add some detail/craters
        ctx.fillStyle = '#6B5345'
        for (let i = 0; i < 3; i++) {
          const craterAngle = Math.random() * Math.PI * 2
          const craterDist = Math.random() * asteroid.size * 0.5
          ctx.beginPath()
          ctx.arc(
            Math.cos(craterAngle) * craterDist,
            Math.sin(craterAngle) * craterDist,
            asteroid.size * 0.2,
            0, Math.PI * 2
          )
          ctx.fill()
        }
        
        ctx.restore()
      })
      
      // Draw studio objects
      const player = playerRef.current
      
      for (let i = 0; i < studioObjects.length; i++) {
        const obj = studioObjects[i]
        const isHovered = hoveredTVRef.current === i
        
        if (obj.isTV) {
          // Draw curved TV screen integrated into hull
          const angle = Math.atan2(obj.y - centerY, obj.x - centerX)
          const arcAngle = obj.width // This is actually the arc angle
          const hullThickness = obj.height
          
          // Draw hull section (thicker part) - brighter when hovered
          ctx.fillStyle = isHovered ? '#3a3a4a' : '#2a2a2a'
          ctx.beginPath()
          ctx.arc(centerX, centerY, OUTER_BOUNDARY + hullThickness, angle - arcAngle / 2, angle + arcAngle / 2)
          ctx.arc(centerX, centerY, OUTER_BOUNDARY - 10, angle + arcAngle / 2, angle - arcAngle / 2, true)
          ctx.closePath()
          ctx.fill()
          
          // Hull border - highlighted when hovered
          ctx.strokeStyle = isHovered ? '#667eea' : '#1a1a1a'
          ctx.lineWidth = isHovered ? 4 : 3
          ctx.stroke()
          
          // Draw curved screen - brighter when hovered
          const gradient = ctx.createRadialGradient(centerX, centerY, OUTER_BOUNDARY, centerX, centerY, OUTER_BOUNDARY + hullThickness - 15)
          if (isHovered) {
            gradient.addColorStop(0, '#7788ff')
            gradient.addColorStop(0.5, '#8855cc')
            gradient.addColorStop(1, '#5a6fff')
          } else {
            gradient.addColorStop(0, '#667eea')
            gradient.addColorStop(0.5, '#764ba2')
            gradient.addColorStop(1, '#4a5fd9')
          }
          
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(centerX, centerY, OUTER_BOUNDARY + hullThickness - 8, angle - arcAngle / 2 + 0.05, angle + arcAngle / 2 - 0.05)
          ctx.arc(centerX, centerY, OUTER_BOUNDARY + 5, angle + arcAngle / 2 - 0.05, angle - arcAngle / 2 + 0.05, true)
          ctx.closePath()
          ctx.fill()
          
          // Screen highlight - stronger when hovered
          ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.3)'
          ctx.lineWidth = isHovered ? 3 : 2
          ctx.beginPath()
          ctx.arc(centerX, centerY, OUTER_BOUNDARY + hullThickness - 12, angle - arcAngle / 2 + 0.08, angle + arcAngle / 2 - 0.08)
          ctx.stroke()
          
          // Add outer glow when hovered
          if (isHovered) {
            ctx.shadowColor = '#667eea'
            ctx.shadowBlur = 25
            ctx.strokeStyle = '#ffdd57'
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(centerX, centerY, OUTER_BOUNDARY + hullThickness, angle - arcAngle / 2, angle + arcAngle / 2)
            ctx.stroke()
            ctx.shadowBlur = 0
          }
          
          // Power indicator lights - brighter when hovered
          for (let j = 0; j < 3; j++) {
            const ledAngle = angle - arcAngle / 2 + (arcAngle / 4) * (j + 0.5)
            const ledX = centerX + Math.cos(ledAngle) * (OUTER_BOUNDARY + hullThickness - 5)
            const ledY = centerY + Math.sin(ledAngle) * (OUTER_BOUNDARY + hullThickness - 5)
            
            if (isHovered) {
              ctx.shadowColor = '#00ff00'
              ctx.shadowBlur = 8
            }
            ctx.fillStyle = isHovered ? '#00ffaa' : '#00ff00'
            ctx.beginPath()
            ctx.arc(ledX, ledY, isHovered ? 3 : 2, 0, Math.PI * 2)
            ctx.fill()
            ctx.shadowBlur = 0
          }
          
          // Glow effect when player is nearby
          if (checkNearby(player, obj, 150) && !isHovered) {
            ctx.shadowColor = '#ffdd57'
            ctx.shadowBlur = 40
            ctx.strokeStyle = '#ffdd57'
            ctx.lineWidth = 5
            ctx.beginPath()
            ctx.arc(centerX, centerY, OUTER_BOUNDARY + hullThickness, angle - arcAngle / 2, angle + arcAngle / 2)
            ctx.stroke()
            ctx.shadowBlur = 0
            
            // Draw "Opening Video..." indicator
            const labelX = centerX + Math.cos(angle) * (OUTER_BOUNDARY + hullThickness + 40)
            const labelY = centerY + Math.sin(angle) * (OUTER_BOUNDARY + hullThickness + 40)
            ctx.fillStyle = '#ffdd57'
            ctx.font = isMobile ? 'bold 12px Arial' : 'bold 16px Arial'
            ctx.textAlign = 'center'
            ctx.fillText('▶ Opening Video...', labelX, labelY)
          }
          
          // No text on hover - modal shows instead
        } else {
          // Draw regular objects
          ctx.fillStyle = obj.color
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
          
          if (obj.border) {
            ctx.strokeStyle = '#000000'
            ctx.lineWidth = 3
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
          }
          
          // Shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.fillRect(obj.x + 5, obj.y + obj.height + 2, obj.width, 10)
          
          // Label
          ctx.fillStyle = '#FFFFFF'
          ctx.font = '12px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(obj.label, obj.x + obj.width / 2, obj.y - 5)
        }
      }
    }

    const drawPlayer = () => {
      const player = playerRef.current
      const mouse = mouseRef.current
      
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.beginPath()
      ctx.ellipse(player.x, player.y + player.height / 2 + 5, player.width / 2, 8, 0, 0, Math.PI * 2)
      ctx.fill()
      
      // Body
      ctx.fillStyle = '#667eea'
      ctx.beginPath()
      ctx.ellipse(player.x, player.y, player.width / 2, player.height / 2, 0, 0, Math.PI * 2)
      ctx.fill()
      
      // Head
      ctx.fillStyle = '#FFD1A9'
      ctx.beginPath()
      ctx.arc(player.x, player.y - player.height / 4, player.width / 3, 0, Math.PI * 2)
      ctx.fill()
      
      // Calculate eye direction based on mouse position
      const headX = player.x
      const headY = player.y - player.height / 4
      const angle = Math.atan2(mouse.y - headY, mouse.x - headX)
      
      // Eye movement range (how far eyes can look)
      const eyeRange = 3
      const eyeOffsetX = Math.cos(angle) * eyeRange
      const eyeOffsetY = Math.sin(angle) * eyeRange
      
      // Draw eyes that follow cursor
      ctx.fillStyle = '#000000'
      ctx.beginPath()
      // Left eye
      ctx.arc(headX - 6 + eyeOffsetX, headY + eyeOffsetY, 2, 0, Math.PI * 2)
      // Right eye
      ctx.arc(headX + 6 + eyeOffsetX, headY + eyeOffsetY, 2, 0, Math.PI * 2)
      ctx.fill()
      
      // Arms
      ctx.strokeStyle = '#667eea'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(player.x - player.width / 3, player.y)
      ctx.lineTo(player.x - player.width / 2, player.y + 10)
      ctx.stroke()
      
      ctx.beginPath()
      ctx.moveTo(player.x + player.width / 3, player.y)
      ctx.lineTo(player.x + player.width / 2, player.y + 10)
      ctx.stroke()
    }

    const drawStudioBranding = () => {
      const centerX = canvas.width / 2
      // Draw logo at the center of the spaceship
      const logoSize = Math.min(canvas.width, canvas.height) < 600 ? 60 : 100 // Smaller on mobile
      const logoX = centerX - logoSize / 2
      const logoY = centerY - logoSize / 2
      
      // Draw logo if loaded (centered in spaceship)
      if (logoRef.current) {
        ctx.save()
        ctx.shadowColor = 'rgba(102, 126, 234, 0.8)'
        ctx.shadowBlur = 20
        ctx.drawImage(logoRef.current, logoX, logoY, logoSize, logoSize)
        ctx.shadowBlur = 0
        ctx.restore()
      }
    }

    // Game loop
    const gameLoop = () => {
      updatePlayer()
      updateLasers()
      updateAsteroids()
      drawStudio()
      drawStudioBranding() // Draw logo first (behind avatar)
      drawPlayer() // Draw avatar on top
      animationFrameRef.current = requestAnimationFrame(gameLoop)
    }

    // Mouse move handler to track cursor position and gun angle
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current.x = e.clientX - rect.left
      mouseRef.current.y = e.clientY - rect.top
      
      // Calculate gun angle to point at mouse
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      gunAngleRef.current = Math.atan2(
        mouseRef.current.y - centerY,
        mouseRef.current.x - centerX
      )
      
      // Check if mouse is hovering over any TV
      hoveredTVRef.current = null
      for (let i = 0; i < studioObjects.length; i++) {
        const obj = studioObjects[i]
        if (obj.isTV) {
          const dist = Math.sqrt(
            Math.pow(mouseRef.current.x - obj.x, 2) + 
            Math.pow(mouseRef.current.y - obj.y, 2)
          )
          if (dist < 100) {
            hoveredTVRef.current = i
            canvas.style.cursor = 'pointer'
            
            // Trigger modal if hover just started
            if (previousHoveredTVRef.current !== i && onVideoTrigger && obj.videoId) {
              onVideoTrigger(obj.videoId, obj.label)
            }
            break
          }
        }
      }
      
      // Update previous hover state
      previousHoveredTVRef.current = hoveredTVRef.current
      
      // Reset cursor if not hovering over TV
      if (hoveredTVRef.current === null) {
        canvas.style.cursor = 'crosshair'
      }
    }

    // Mouse click handler for shooting lasers and TVs
    const handleCanvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      
      // Check if clicked on any TV (updated for curved TVs)
      let clickedTV = false
      for (let obj of studioObjects) {
        if (obj.isTV && obj.videoId) {
          // Check if click is near the TV position on hull
          const dist = Math.sqrt(Math.pow(clickX - obj.x, 2) + Math.pow(clickY - obj.y, 2))
          if (dist < 100) {
            if (onVideoTrigger) {
              onVideoTrigger(obj.videoId, obj.label)
            }
            clickedTV = true
            break
          }
        }
      }
      
      // If didn't click TV, shoot laser
      if (!clickedTV) {
        const gunX = centerX + Math.cos(gunAngleRef.current) * GUN_RADIUS
        const gunY = centerY + Math.sin(gunAngleRef.current) * GUN_RADIUS
        
        const speed = 10
        lasersRef.current.push({
          x: gunX,
          y: gunY,
          vx: Math.cos(gunAngleRef.current) * speed,
          vy: Math.sin(gunAngleRef.current) * speed
        })
      }
    }

    // Keyboard event listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false
    }

    // Touch controls for mobile
    let touchStartX = 0
    let touchStartY = 0
    let isTouching = false

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      touchStartX = touch.clientX - rect.left
      touchStartY = touch.clientY - rect.top
      isTouching = true

      // Update mouse position for gun targeting
      mouseRef.current.x = touchStartX
      mouseRef.current.y = touchStartY
      
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      gunAngleRef.current = Math.atan2(
        mouseRef.current.y - centerY,
        mouseRef.current.x - centerX
      )

      // Check if tapped on TV
      for (let obj of studioObjects) {
        if (obj.isTV && obj.videoId) {
          const dist = Math.sqrt(Math.pow(touchStartX - obj.x, 2) + Math.pow(touchStartY - obj.y, 2))
          if (dist < 100) {
            if (onVideoTrigger) {
              onVideoTrigger(obj.videoId, obj.label)
            }
            return
          }
        }
      }

      // Shoot laser on tap (outside TVs)
      const dx = mouseRef.current.x - centerX
      const dy = mouseRef.current.y - centerY
      const laserSpeed = 8
      const magnitude = Math.sqrt(dx * dx + dy * dy)
      
      const gunX = centerX + Math.cos(gunAngleRef.current) * GUN_RADIUS
      const gunY = centerY + Math.sin(gunAngleRef.current) * GUN_RADIUS
      
      lasersRef.current.push({
        x: gunX,
        y: gunY,
        vx: (dx / magnitude) * laserSpeed,
        vy: (dy / magnitude) * laserSpeed
      })
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouching) return
      e.preventDefault()
      
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const touchX = touch.clientX - rect.left
      const touchY = touch.clientY - rect.top

      // Update mouse position for gun targeting
      mouseRef.current.x = touchX
      mouseRef.current.y = touchY
      
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      gunAngleRef.current = Math.atan2(
        mouseRef.current.y - centerY,
        mouseRef.current.x - centerX
      )

      // Move player based on swipe direction
      const deltaX = touchX - touchStartX
      const deltaY = touchY - touchStartY
      const threshold = 10

      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        const player = playerRef.current
        
        // Normalize the movement
        const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        player.x += (deltaX / magnitude) * player.speed
        player.y += (deltaY / magnitude) * player.speed

        // Update direction based on larger movement
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          player.direction = deltaX > 0 ? 'right' : 'left'
        } else {
          player.direction = deltaY > 0 ? 'down' : 'up'
        }

        // Keep player within boundary
        const distFromCenter = Math.sqrt(
          Math.pow(player.x - centerX, 2) + Math.pow(player.y - centerY, 2)
        )
        if (distFromCenter > OUTER_BOUNDARY - 20) {
          const angle = Math.atan2(player.y - centerY, player.x - centerX)
          player.x = centerX + Math.cos(angle) * (OUTER_BOUNDARY - 20)
          player.y = centerY + Math.sin(angle) * (OUTER_BOUNDARY - 20)
        }

        touchStartX = touchX
        touchStartY = touchY
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      isTouching = false
    }

    canvas.addEventListener('click', handleCanvasClick)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    // Start game loop
    gameLoop()

    // Cleanup
    return () => {
      canvas.removeEventListener('click', handleCanvasClick)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} />
}

