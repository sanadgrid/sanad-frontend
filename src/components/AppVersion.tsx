const built = new Date(__APP_BUILT__).toLocaleString('ar-SA-u-ca-gregory-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// Release number of the running build (see vite.config.ts). The commit is kept
// out of sight in a data attribute: handy when diagnosing, noise for everyone else.
export function AppVersion() {
  return (
    <span className="app-version" title={`آخر تحديث: ${built}`} data-commit={__APP_COMMIT__}>
      الإصدار <span className="num" dir="ltr">{__APP_VERSION__}</span>
    </span>
  )
}
