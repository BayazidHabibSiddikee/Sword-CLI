export const REPORT_STATUS = {
  idle: { icon: '⏸', color: 'text-cyber-textDim', bg: 'bg-cyber-textDim/10 text-cyber-textDim', label: 'IDLE' },
  generating: { icon: '⟳', color: 'text-cyber-primary animate-pulse', bg: 'bg-cyber-primary/10 text-cyber-primary animate-pulse', label: 'GENERATING' },
  verifying: { icon: '🧠', color: 'text-cyber-accent animate-pulse', bg: 'bg-cyber-accent/10 text-cyber-accent animate-pulse', label: 'VERIFYING' },
  complete: { icon: '✓', color: 'text-green-400', bg: 'bg-green-400/10 text-green-400', label: 'COMPLETE' },
  error: { icon: '✗', color: 'text-cyber-secondary', bg: 'bg-cyber-secondary/10 text-cyber-secondary', label: 'ERROR' },
} as const;
export const CONNECTION_STATUS = {
  connected: { color: 'text-cyber-primary', label: 'ONLINE', headerLabel: 'LINK ESTABLISHED' },
  connecting: { color: 'text-cyber-accent animate-pulse', label: 'CONNECTING...', headerLabel: 'HANDSHAKE IN PROGRESS' },
  disconnected: { color: 'text-cyber-textDim', label: 'OFFLINE', headerLabel: 'LINK SEVERED' },
  error: { color: 'text-cyber-secondary animate-pulse', label: 'ERROR', headerLabel: 'COMMUNICATION ERROR' },
} as const;
