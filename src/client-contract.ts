import type * as React from 'react'
// Only the primitives and Remote methods consumed by this Client; supplied by DSH.
declare const require: (id: '@deepseek-ai/dsh-client-ui-primitives') => {
 Menu: React.ComponentType<{ open: boolean; onClose(): void; items: { id: string; disabled: boolean; label: React.ReactNode }[]; selectedId?: string; align: string; portal: boolean; className: string; anchor: React.ReactNode; onSelect(id: string): void }>
 Toast: React.ComponentType<{ text: string; icon: React.ReactNode; holdMs: number; onDone(): void }>
 IconAgentPresetOutlineRegular: React.ComponentType<{ className?: string }>
 IconChevronDownOutlineRegular: React.ComponentType<{ className?: string }>
 IconWarningOutlineRegular: React.ComponentType
}
export const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
export interface Option { id: string; name?: string; description?: string; broken?: string }
type Reply<T> = { ok: true; value: T } | { ok: false; error: { message: string } }
interface Remote {
 agentPresets: { list(): Promise<Reply<{ presets: Option[] }>> }
 commands: { execute(id: string, command: string, attachments: never[]): Promise<Reply<{ result: { kind: string; text?: string } } | undefined>> }
 $on(name: 'agent-preset/selected' | 'api-session/error' | 'api-session/removed', fn: (sessionId: string, value: string) => void): () => void
}
export interface SessionProps {
 sessionId: string
 useSessions<T>(select: (state: { byId: Record<string, { projectionValues?: { agentPreset?: unknown }; running?: boolean }> }) => T): T
}
export interface ClientContext {
 get(name: 'locale'): { bind(namespace: string): (key: string) => string; resolveText(text: { zh: string; en: string }): string; subscribe(fn: () => void): () => void; getSnapshot(): unknown }
 get(name: 'remote'): Remote | undefined
 get(name: 'slots'): { inject(name: string, fn: () => (() => void)): () => void; register(options: { name: string; id: string; priority: number; order: number }, component: React.ComponentType<SessionProps>): () => void } | undefined
 effect(fn: () => (() => void)): () => void
}
