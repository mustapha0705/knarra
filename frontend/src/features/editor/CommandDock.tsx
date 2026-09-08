import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { CloseIcon, PlusIcon, SendIcon } from '../../components/icons'
import type { CommandRecord } from './types'
import styles from './Editor.module.css'

export type MentionEntry = {
  referenceId: string
  name: string
  meta: string
}

export type ContextChip = {
  id: string
  label: string
}

type CommandDockProps = {
  prompt: string
  mentionPool: MentionEntry[]
  contextChips: ContextChip[]
  suggestions: string[]
  showSuggestions: boolean
  status: string
  statusTone: 'muted' | 'warn' | 'ok'
  history: CommandRecord[]
  historyOpen: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onRemoveChip: (id: string) => void
  onPickSuggestion: (text: string) => void
  onToggleHistory: () => void
  onAttach: () => void
}

const MAX_MENTION_ITEMS = 8
const MAX_PROMPT_HEIGHT = 120

export function CommandDock({
  prompt,
  mentionPool,
  contextChips,
  suggestions,
  showSuggestions,
  status,
  statusTone,
  history,
  historyOpen,
  onPromptChange,
  onSubmit,
  onRemoveChip,
  onPickSuggestion,
  onToggleHistory,
  onAttach,
}: CommandDockProps) {
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)

  const query = mentionQuery.toLowerCase()
  const mentionItems = mentionPool
    .filter(
      (entry) =>
        !query ||
        entry.referenceId.toLowerCase().includes(query) ||
        entry.name.toLowerCase().includes(query),
    )
    .slice(0, MAX_MENTION_ITEMS)

  // Grow with the text, including when a suggestion sets it from outside.
  useEffect(() => {
    const element = promptRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(MAX_PROMPT_HEIGHT, element.scrollHeight)}px`
  }, [prompt])

  // Restore the caret after a mention is spliced in.
  useEffect(() => {
    const caret = pendingCaret.current
    if (caret == null) return
    pendingCaret.current = null
    const element = promptRef.current
    if (!element) return
    element.focus()
    try {
      element.setSelectionRange(caret, caret)
    } catch {
      // Some browsers refuse while the element is detached; harmless.
    }
  }, [prompt])

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    const upto = value.slice(0, event.target.selectionStart ?? value.length)
    const match = /@([A-Za-z0-9-]*)$/.exec(upto)
    setMentionOpen(Boolean(match))
    setMentionQuery(match ? match[1] : '')
    setMentionIndex(0)
    onPromptChange(value)
  }

  const insertMention = (referenceId: string) => {
    const element = promptRef.current
    const caret = element?.selectionStart ?? prompt.length
    const before = prompt.slice(0, caret).replace(/@([A-Za-z0-9-]*)$/, '')
    const after = prompt.slice(caret)
    pendingCaret.current = `${before}@${referenceId} `.length
    setMentionOpen(false)
    setMentionQuery('')
    onPromptChange(`${before}@${referenceId} ${after}`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex((index) =>
          Math.max(0, Math.min(mentionItems.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))),
        )
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const pick = mentionItems[mentionIndex] ?? mentionItems[0]
        if (pick) insertMention(pick.referenceId)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionOpen(false)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  const statusClass = [
    styles.status,
    statusTone === 'warn' && styles.statusWarn,
    statusTone === 'ok' && styles.statusOk,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.commandDock}>
      {mentionOpen && (
        <div role="listbox" aria-label="Insert asset mention" className={styles.mentionList}>
          {mentionItems.map((entry, index) => (
            <button
              key={entry.referenceId}
              type="button"
              role="option"
              aria-selected={index === mentionIndex}
              className={[styles.mentionItem, index === mentionIndex && styles.mentionItemActive]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setMentionIndex(index)}
              onClick={() => insertMention(entry.referenceId)}
            >
              <span className={styles.badge}>{entry.referenceId}</span>
              <span className={styles.mentionName}>{entry.name}</span>
              <span className={styles.mentionMeta}>{entry.meta}</span>
            </button>
          ))}
          {!mentionItems.length && <div className={styles.mentionEmpty}>No matching assets</div>}
        </div>
      )}

      {contextChips.length > 0 && (
        <div className={styles.contextRow}>
          <span className={styles.contextLabel}>Context</span>
          {contextChips.map((chip) => (
            <div key={chip.id} className={styles.contextChip}>
              <span>{chip.label}</span>
              <button
                type="button"
                aria-label={`Remove ${chip.label} from command context`}
                className={styles.contextChipRemove}
                onClick={() => onRemoveChip(chip.id)}
              >
                <CloseIcon size={10} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.promptRow}>
        <button type="button" aria-label="Attach media" className={styles.promptAttach} onClick={onAttach}>
          <PlusIcon size={15} strokeWidth={1.8} />
        </button>

        <textarea
          ref={promptRef}
          rows={1}
          aria-label="Describe the video you want to create"
          placeholder="Describe the video you want to create…"
          className={styles.promptInput}
          value={prompt}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />

        <button
          type="button"
          aria-label="Generate plan"
          className={[styles.promptSend, prompt.trim() && styles.promptSendReady].filter(Boolean).join(' ')}
          onClick={onSubmit}
        >
          <SendIcon size={16} />
        </button>
      </div>

      <div className={styles.dockFooter}>
        {showSuggestions && (
          <div className={styles.suggestions}>
            {suggestions.map((text) => (
              <button
                key={text}
                type="button"
                className={styles.suggestion}
                onClick={() => onPickSuggestion(text)}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        {status && (
          <div aria-live="polite" className={statusClass}>
            {status}
          </div>
        )}
        <div className={styles.toolbarSpacer} />
        {history.length > 0 && (
          <button
            type="button"
            aria-expanded={historyOpen}
            className={styles.historyToggle}
            onClick={onToggleHistory}
          >
            {historyOpen ? 'Hide' : 'Show'} history ({history.length})
          </button>
        )}
      </div>

      {historyOpen && (
        <div className={styles.historyList}>
          {history
            .slice()
            .reverse()
            .map((record) => (
              <div key={record.id} className={styles.historyRow}>
                <span className={styles.historyDot} />
                <span className={styles.historyPrompt}>{record.prompt}</span>
                <span className={styles.historyStatus}>{record.status}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
