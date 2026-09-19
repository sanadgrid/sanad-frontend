import type { ToastMessage } from '../useToast'

interface ToastProps {
  toast: ToastMessage
  onDismiss: () => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const { action } = toast
  return (
    <div className={`rc-toast rc-toast--${toast.kind}${action ? ' rc-toast--action' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span>{toast.text}</span>
      {action && (
        <button
          className="rc-toast__action"
          type="button"
          onClick={() => {
            onDismiss()
            action.run()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
