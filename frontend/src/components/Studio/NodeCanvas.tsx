import React, { useState, useRef, useEffect } from 'react'
import type { PipelineNode } from '../../types'
import { NodeCard } from './NodeCard'

interface NodeCanvasProps {
  nodes: PipelineNode[]
  setNodes: React.Dispatch<React.SetStateAction<PipelineNode[]>>
  selectedNode: PipelineNode | null
  setSelectedNode: (node: PipelineNode | null) => void
}

export const NodeCanvas: React.FC<NodeCanvasProps> = ({
  nodes,
  setNodes,
  selectedNode,
  setSelectedNode,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent, node: PipelineNode) => {
    // Only drag with left mouse
    if (e.button !== 0) return
    e.stopPropagation()
    setDraggingId(node.id)
    dragOffsetRef.current = {
      x: e.clientX - node.x,
      y: e.clientY - node.y,
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId) return
    const newX = Math.max(20, Math.min(2200, e.clientX - dragOffsetRef.current.x))
    const newY = Math.max(20, Math.min(1400, e.clientY - dragOffsetRef.current.y))

    setNodes((prev) =>
      prev.map((n) => (n.id === draggingId ? { ...n, x: newX, y: newY } : n))
    )
  }

  const handleMouseUp = () => {
    setDraggingId(null)
  }

  useEffect(() => {
    const onWindowMouseUp = () => setDraggingId(null)
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [])

  // Calculate Bezier cables between sequential nodes
  const renderCables = () => {
    const cables = []
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i]
      const to = nodes[i + 1]

      const startX = from.x + 288 // width of card
      const startY = from.y + 110 // vertical center of card
      const endX = to.x
      const endY = to.y + 110

      const deltaX = Math.max(60, (endX - startX) * 0.5)
      const pathData = `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`

      const isCurrentActive = from.status === 'running' || to.status === 'running'
      const isPastCompleted = from.status === 'completed' && to.status === 'completed'

      cables.push(
        <g key={`cable-${from.id}-${to.id}`}>
          {/* Outer glow line */}
          <path
            d={pathData}
            fill="none"
            stroke={isCurrentActive ? 'var(--accent-color)' : isPastCompleted ? 'var(--accent-color)' : 'var(--border-strong)'}
            strokeOpacity={isPastCompleted ? 0.6 : 1}
            strokeWidth={isCurrentActive ? 4 : 2}
            strokeDasharray={isCurrentActive ? '6,6' : 'none'}
            className={isCurrentActive ? 'animate-pulse' : ''}
          />
        </g>
      )
    }
    return cables
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={() => setSelectedNode(null)}
      className="relative flex-1 h-full overflow-auto bg-[var(--bg-app)] bg-[radial-gradient(var(--canvas-dots)_1px,transparent_1px)] [background-size:24px_24px] cursor-grab active:cursor-grabbing select-none transition-colors duration-200"
    >
      {/* SVG Canvas for Bezier Cables */}
      <svg className="absolute inset-0 w-[2600px] h-[1600px] pointer-events-none z-10">
        {renderCables()}
      </svg>

      {/* Interactive Node Cards */}
      <div className="relative w-[2600px] h-[1600px] z-20">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            isSelected={selectedNode?.id === node.id}
            onSelect={(n) => {
              setSelectedNode(n)
            }}
            onMouseDown={handleMouseDown}
          />
        ))}
      </div>
    </div>
  )
}
