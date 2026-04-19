'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import styles from './CSS3DVideoScene.module.css'

interface Video {
  id: string
  description: string
}

interface CSS3DVideoSceneProps {
  videos: Video[]
  onVideoClick?: (videoId: string, description: string) => void
}

function createVideoElement(videoId: string, description: string): HTMLDivElement {
  const div = document.createElement('div')
  div.className = styles.videoContainer
  div.style.width = '480px'
  div.style.height = '360px'
  div.style.backgroundColor = '#000'
  div.style.borderRadius = '8px'
  div.style.overflow = 'hidden'
  div.style.cursor = 'pointer'
  div.style.transition = 'box-shadow 0.3s, border-color 0.3s'
  div.style.border = '3px solid transparent'
  
  // Add description overlay
  const descriptionDiv = document.createElement('div')
  descriptionDiv.className = styles.videoDescription
  descriptionDiv.textContent = description
  descriptionDiv.style.position = 'absolute'
  descriptionDiv.style.bottom = '0'
  descriptionDiv.style.left = '0'
  descriptionDiv.style.right = '0'
  descriptionDiv.style.background = 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)'
  descriptionDiv.style.color = '#fff'
  descriptionDiv.style.padding = '12px'
  descriptionDiv.style.fontSize = '14px'
  descriptionDiv.style.pointerEvents = 'none'
  div.appendChild(descriptionDiv)

  const iframe = document.createElement('iframe')
  iframe.style.width = '100%'
  iframe.style.height = '100%'
  iframe.style.border = '0'
  iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0`
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
  iframe.allowFullscreen = true
  div.appendChild(iframe)

  // Hover effect - using box-shadow and border instead of transform to avoid breaking 3D layout
  div.addEventListener('mouseenter', () => {
    div.style.boxShadow = '0 16px 64px rgba(102, 126, 234, 0.6), 0 0 0 3px rgba(102, 126, 234, 0.5)'
    div.style.borderColor = 'rgba(102, 126, 234, 0.8)'
  })
  div.addEventListener('mouseleave', () => {
    div.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)'
    div.style.borderColor = 'transparent'
  })

  return div
}

export default function CSS3DVideoScene({ videos, onVideoClick }: CSS3DVideoSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const blockerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<CSS3DRenderer | null>(null)
  const controlsRef = useRef<TrackballControls | null>(null)
  const animationFrameRef = useRef<number>()

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || videos.length < 4) return
    const hasTopVideo = videos.length >= 5
    const hasBottomVideo = videos.length >= 6

    const container = containerRef.current
    const blocker = blockerRef.current

    // Camera
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 5000)
    camera.position.set(500, 350, 750)
    cameraRef.current = camera

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Renderer
    const renderer = new CSS3DRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.top = '0'
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Group to hold all videos
    const group = new THREE.Group()

    // Create video elements and position them in a cube formation
    // Front (0, 0, 240)
    const video1 = createVideoElement(videos[0].id, videos[0].description)
    const object1 = new CSS3DObject(video1)
    object1.position.set(0, 0, 240)
    object1.rotation.y = 0
    video1.addEventListener('click', () => {
      if (onVideoClick) onVideoClick(videos[0].id, videos[0].description)
    })
    group.add(object1)

    // Right (240, 0, 0)
    const video2 = createVideoElement(videos[1].id, videos[1].description)
    const object2 = new CSS3DObject(video2)
    object2.position.set(240, 0, 0)
    object2.rotation.y = Math.PI / 2
    video2.addEventListener('click', () => {
      if (onVideoClick) onVideoClick(videos[1].id, videos[1].description)
    })
    group.add(object2)

    // Back (0, 0, -240)
    const video3 = createVideoElement(videos[2].id, videos[2].description)
    const object3 = new CSS3DObject(video3)
    object3.position.set(0, 0, -240)
    object3.rotation.y = Math.PI
    video3.addEventListener('click', () => {
      if (onVideoClick) onVideoClick(videos[2].id, videos[2].description)
    })
    group.add(object3)

    // Left (-240, 0, 0)
    const video4 = createVideoElement(videos[3].id, videos[3].description)
    const object4 = new CSS3DObject(video4)
    object4.position.set(-240, 0, 0)
    object4.rotation.y = -Math.PI / 2
    video4.addEventListener('click', () => {
      if (onVideoClick) onVideoClick(videos[3].id, videos[3].description)
    })
    group.add(object4)

    // Top (0, 240, 0) — 5th video on the top face of the cube
    if (hasTopVideo) {
      const video5 = createVideoElement(videos[4].id, videos[4].description)
      const object5 = new CSS3DObject(video5)
      object5.position.set(0, 240, 0)
      object5.rotation.x = -Math.PI / 2
      video5.addEventListener('click', () => {
        if (onVideoClick) onVideoClick(videos[4].id, videos[4].description)
      })
      group.add(object5)
    }

    // Bottom (0, -240, 0) — 6th video on the bottom face of the cube
    if (hasBottomVideo) {
      const video6 = createVideoElement(videos[5].id, videos[5].description)
      const object6 = new CSS3DObject(video6)
      object6.position.set(0, -240, 0)
      object6.rotation.x = Math.PI / 2
      video6.addEventListener('click', () => {
        if (onVideoClick) onVideoClick(videos[5].id, videos[5].description)
      })
      group.add(object6)
    }

    scene.add(group)

    // Controls
    const controls = new TrackballControls(camera, renderer.domElement)
    controls.rotateSpeed = 4
    controlsRef.current = controls

    // Block iframe events when dragging camera
    if (blocker) {
      blocker.style.display = 'none'
      
      controls.addEventListener('start', () => {
        if (blocker) blocker.style.display = ''
      })
      
      controls.addEventListener('end', () => {
        if (blocker) blocker.style.display = 'none'
      })
    }

    // Window resize handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
      controls.dispose()
    }
  }, [videos, onVideoClick])

  return (
    <>
      <div ref={containerRef} className={styles.container} />
      <div ref={blockerRef} className={styles.blocker} />
    </>
  )
}

