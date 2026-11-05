"use client"

import { GripVertical } from "lucide-react"
import { useRef, useState } from "react"

interface ReorderableListProps<T> {
  items: T[]
  onChange: (items: T[]) => void
  renderItem: (item: T, dragHandle: React.ReactNode, isDragging: boolean) => React.ReactNode
  getId: (item: T) => string
}

export function ReorderableList<T>({
  items,
  onChange,
  renderItem,
  getId,
}: ReorderableListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(index))
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setOverIndex(index)
  }

  const handleDragEnd = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      const newItems = [...items]
      const [removed] = newItems.splice(dragIndex, 1)
      newItems.splice(overIndex, 0, removed!)
      onChange(newItems)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleDragLeave = () => setOverIndex(null)

  return (
    <>
      {items.map((item, i) => {
        const isDragging = dragIndex === i
        const dragHandle = (
          <span
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragEnd={handleDragEnd}
            className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 transition-colors p-1 -ml-1"
            aria-label={`Drag to reorder`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )

        return (
          <div
            key={getId(item)}
            className={`transition-all duration-200 ${isDragging ? "opacity-50" : ""} ${
              overIndex === i && dragIndex !== i ? "border-t-2 border-emerald-500" : ""
            }`}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => {
              e.preventDefault()
              handleDragEnd()
            }}
          >
            {renderItem(item, dragHandle, isDragging)}
          </div>
        )
      })}
    </>
  )
}
