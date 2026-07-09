'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Sparkles, Loader2, FileText, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
// randomUUID via Web Crypto API (crypto.randomUUID())

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources: string[]
  createdAt: string
}

const suggestedQuestions = [
  'How many documents do I have?',
  'Show all invoices',
  'What is the total spend?',
  'Which vendor has the lowest billing?',
  'Help — what can you do?',
]

// Simple markdown-like rendering
function renderContent(text: string) {
  // Split by lines and handle basic markdown
  const lines = text.split('\n')
  return lines.map((line, i) => {
    // Bold
    let rendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code
    rendered = rendered.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    // Blockquote
    if (rendered.startsWith('> ')) {
      return (
        <blockquote key={i} className="border-l-2 border-muted-foreground/30 pl-3 text-sm text-muted-foreground italic">
          {rendered.substring(2)}
        </blockquote>
      )
    }
    // Bullet points
    if (rendered.startsWith('• ')) {
      return (
        <li key={i} className="ml-4 text-sm list-disc" dangerouslySetInnerHTML={{ __html: rendered.substring(2) }} />
      )
    }
    // Numbered items
    const numberedMatch = rendered.match(/^(\d+)\.\s+(.+)/)
    if (numberedMatch) {
      return (
        <li key={i} className="ml-4 text-sm list-decimal" dangerouslySetInnerHTML={{ __html: numberedMatch[2] }} />
      )
    }
    // Empty line
    if (rendered.trim() === '') return <br key={i} />
    // Normal text
    return <p key={i} className="text-sm" dangerouslySetInnerHTML={{ __html: rendered }} />
  })
}

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => crypto.randomUUID())
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?sessionId=${sessionId}`)
      const data = await res.json()
      if (data.success && data.messages.length > 0) {
        setMessages(data.messages)
      }
    } catch { /* silent */ }
  }, [sessionId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      sources: [],
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      })
      const data = await res.json()

      if (data.success) {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
          sources: data.sources || [],
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, assistantMessage])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Sorry, something went wrong. Please try again.',
            sources: [],
            createdAt: new Date().toISOString(),
          },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Failed to connect. Check if the server is running.',
          sources: [],
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleSuggested = (q: string) => {
    setInput(q)
    sendMessage(q)
  }

  const clearChat = () => {
    setMessages([])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Procurement Copilot</h1>
          <p className="text-muted-foreground mt-1">
            Ask anything about your procurement data — documents, vendors, risks, forecasts
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Welcome Message (when empty) */}
            {messages.length === 0 && (
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted rounded-xl rounded-tl-none px-4 py-3">
                  <p className="text-sm">
                    Hi! I&apos;m your AI Procurement Copilot. I can search your uploaded documents,
                    analyze vendor data, find invoices, and answer procurement questions.
                  </p>
                </div>
              </div>
            )}

            {/* Suggested Questions (when empty) */}
            {messages.length === 0 && (
              <div className="space-y-2 pl-11">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Try asking:
                </p>
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggested(q)}
                    className="block w-full text-left text-sm px-3 py-2 rounded-lg border hover:bg-muted/50 hover:border-primary/30 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`p-2 rounded-lg shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/10 text-primary'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                    : 'bg-muted rounded-tl-none'
                }`}>
                  <div className="space-y-0.5">
                    {renderContent(msg.content)}
                  </div>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Sources
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {loading && (
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted rounded-xl rounded-tl-none px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Searching documents &amp; generating answer...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t p-3">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about vendors, invoices, contracts, risks..."
              className="flex-1"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
            <Button type="submit" size="icon" disabled={!input.trim() || loading}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}