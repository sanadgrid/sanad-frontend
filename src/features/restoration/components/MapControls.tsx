import { Icon, type IconName } from '../../../components/Icon'
import { useFullscreen } from '../useFullscreen'

interface MapControlsProps {
  onZoom: (by: 1 | -1) => void
  onFitStations: () => void
}

interface ControlProps {
  icon: IconName
  label: string
  pressed?: boolean
  onClick: (button: HTMLButtonElement) => void
}

function Control({ icon, label, pressed, onClick }: ControlProps) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={(e) => onClick(e.currentTarget)}>
      <Icon name={icon} size={17} />
    </button>
  )
}

/** Every button that moves the map, in one stack beside it. */
export function MapControls({ onZoom, onFitStations }: MapControlsProps) {
  const fullscreen = useFullscreen('.rc')

  return (
    <div className="rc-float rc-controls" role="group" aria-label="التحكم في الخريطة">
      <Control icon="plus" label="تكبير" onClick={() => onZoom(1)} />
      <Control icon="minus" label="تصغير" onClick={() => onZoom(-1)} />
      <Control icon="fit" label="إظهار كل المحطات" onClick={onFitStations} />
      {fullscreen.supported && (
        <Control
          icon={fullscreen.active ? 'minimize' : 'maximize'}
          label={fullscreen.active ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
          pressed={fullscreen.active}
          onClick={fullscreen.toggle}
        />
      )}
    </div>
  )
}
