import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { formatHours } from './cellStatus'

const MAX_HOURS = 168 // keep in step with api/people.go

type Props = {
  name: string
  value: number
  /** Resolves when saved; rejects with an Error whose message is shown. */
  onSave: (hours: number) => Promise<void>
}

type State =
  | { kind: 'idle' }
  | { kind: 'editing'; draft: string; error?: string }
  | { kind: 'saving'; draft: string }

// Not optimistic: the grid keeps showing the saved value until the server
// confirms, so a failed save never leaves wrong numbers on screen. On failure
// the editor stays open with the manager's draft and the reason.
export function WeeklyHoursEditor({ name, value, onSave }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' })

  if (state.kind === 'idle') {
    return (
      <button
        type="button"
        className="hours-button"
        onClick={() => setState({ kind: 'editing', draft: formatHours(value) })}
        aria-label={`Edit weekly hours for ${name}, currently ${formatHours(value)}`}
      >
        {formatHours(value)}h <span aria-hidden="true">✎</span>
      </button>
    )
  }

  const saving = state.kind === 'saving'
  const error = state.kind === 'editing' ? state.error : undefined

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (saving) return
    const hours = Number(state.draft)
    if (state.draft.trim() === '' || !Number.isFinite(hours) || hours < 0 || hours > MAX_HOURS) {
      setState({ kind: 'editing', draft: state.draft, error: `Enter hours between 0 and ${MAX_HOURS}.` })
      return
    }
    if (hours === value) {
      setState({ kind: 'idle' })
      return
    }
    setState({ kind: 'saving', draft: state.draft })
    try {
      await onSave(hours)
      setState({ kind: 'idle' })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error.'
      setState({ kind: 'editing', draft: state.draft, error: `Not saved: ${reason}` })
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) setState({ kind: 'idle' })
  }

  return (
    <form className="hours-editor" onSubmit={submit}>
      <input
        type="number"
        min={0}
        max={MAX_HOURS}
        step="0.5"
        autoFocus
        value={state.draft}
        disabled={saving}
        aria-label={`Weekly hours for ${name}`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setState({ kind: 'editing', draft: e.target.value })}
        onKeyDown={onKeyDown}
      />
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : error ? 'Retry' : 'Save'}
      </button>
      <button type="button" disabled={saving} onClick={() => setState({ kind: 'idle' })}>
        Cancel
      </button>
      {error && (
        <span role="alert" className="error-text">
          {error}
        </span>
      )}
    </form>
  )
}
