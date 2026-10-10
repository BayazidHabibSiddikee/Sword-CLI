import { useState, useEffect, useRef, useCallback } from 'react'
import { PipelineStageId } from '../types/pipeline'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type WebSocketMessage = 
  // Incoming from backend
  | { type: 'stage_start'; reportId: string; stage: PipelineStageId; message: string; progress: number }
  | { type: 'stage_progress'; reportId: string; stage: PipelineStageId; progress: number; log: string }
  | { type: 'stage_complete'; reportId: string; stage: PipelineStageId; progress: number }
  | { type: 'stage_error'; reportId: string; stage: PipelineStageId; error: string; recoverable: boolean }
  | { type: 'log'; reportId: string; stage: PipelineStageId; content: string }
  | { type: 'assets_ready'; reportId: string; assets: Array<{ type: string; path: string; label: string }> }
  | { type: 'intervention_required'; reportId: string; stage: PipelineStageId; message: string; params: Record<string, any> }
  | { type: 'complete'; reportId: string; progress: number; status: string; message: string }
  | { type: 'error'; reportId: string; message: string }
  // Outgoing to backend
  | { type: 'generate'; reportId: string; payload: Record<string, any> }
  | { type: 'intervention_response'; reportId: string; stage: PipelineStageId; action: 'retry' | 'skip' | 'abort'; params?: Record<string, any> }

export function useWebSocket(url: string = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws') {
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setConnectionStatus('connecting')
    
    try {
      const apiKey = import.meta.env.VITE_API_KEY || 'dev-secret-key'
      const wsUrl = url.includes('?') ? `${url}&api_key=${apiKey}` : `${url}?api_key=${apiKey}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnectionStatus('connected')
        reconnectAttempts.current = 0
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastMessage(data)
        } catch (err) {
          console.error('[WS] Failed to parse message:', err)
        }
      }

      ws.onclose = () => {
        setConnectionStatus('disconnected')
        
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        } else {
          setConnectionStatus('error')
        }
      }

      ws.onerror = (error) => {
        console.error('[WS] Error:', error)
        setConnectionStatus('error')
      }
    } catch (err) {
      console.error('[WS] Connection failed:', err)
      setConnectionStatus('error')
    }
  }, [url])

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('[WS] Cannot send message: not connected')
    }
  }, [])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionStatus('disconnected')
  }, [])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return {
    lastMessage,
    connectionStatus,
    sendMessage,
    connect,
    disconnect,
  }
}