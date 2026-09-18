import { Icon } from '../../../components/Icon'
import { fmt } from '../labels'
import type { ImportJob } from '../useLayerImport'

interface ImportProgressProps {
  jobs: ImportJob[]
  running: boolean
}

const STATE_LABEL: Record<ImportJob['state'], string> = {
  waiting: 'في الانتظار',
  running: 'جارٍ الحفظ',
  done: 'تم',
  failed: 'تعذّر الحفظ',
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

export function ImportProgress({ jobs, running }: ImportProgressProps) {
  const done = jobs.filter((job) => job.state === 'done').length
  const failed = jobs.filter((job) => job.state === 'failed').length
  const overall = jobs.reduce((sum, job) => sum + (job.state === 'failed' ? 1 : job.progress), 0) / jobs.length

  return (
    <>
      {running ? (
        <div className="rc-import__overall" role="status">
          <p>
            جارٍ حفظ الطبقات… <b className="num">{fmt(done + failed)}</b> من <b className="num">{fmt(jobs.length)}</b>
          </p>
          <progress className="rc-progress" value={overall} max={1} aria-label="التقدم الكلي" />
          <small>أبقِ هذه النافذة مفتوحة حتى يكتمل الحفظ.</small>
        </div>
      ) : (
        <div className="rc-import__summary" role="status">
          {done > 0 && (
            <p className="rc-ok">
              <Icon name="check" size={16} />
              <span>
                تم استيراد <b className="num">{fmt(done)}</b> طبقة. تجدها في «طبقات الخريطة» ضمن خيارات التصفية.
              </span>
            </p>
          )}
          {failed > 0 && (
            <p className="rc-bad">
              <Icon name="alert" size={16} />
              <span>
                تعذّر استيراد <b className="num">{fmt(failed)}</b> طبقة. تأكد من صلاحياتك ومن اتصالك بالشبكة ثم أعد المحاولة.
              </span>
            </p>
          )}
        </div>
      )}

      <ul className="rc-import__list rc-import__list--jobs">
        {jobs.map((job) => (
          <li key={job.path} className={`rc-import__job rc-import__job--${job.state}`}>
            <span className="rc-import__name">
              <bdi>{job.name}</bdi>
            </span>
            <span className="rc-import__state">
              {job.state === 'running' ? <span className="num">{percent(job.progress)}</span> : STATE_LABEL[job.state]}
            </span>
            <progress
              className="rc-progress"
              value={job.state === 'failed' ? 0 : job.progress}
              max={1}
              aria-label={`تقدم حفظ ${job.name}`}
            />
          </li>
        ))}
      </ul>
    </>
  )
}
