import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

interface TimePickerInputProps {
  value: string
  ariaLabel: string
  className?: string
  onValueChange: (value: string) => void
}

interface TimeParts {
  hour: number
  minute: number
}

const padTimePart = (value: number): string => String(value).padStart(2, '0')
const normalizeMinute = (minute: number): number => Math.min(Math.round(minute / 10) * 10, 50)

const parseTimeValue = (value: string): TimeParts => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) {
    return { hour: 0, minute: 0 }
  }

  return {
    hour: Number(match[1]),
    minute: normalizeMinute(Number(match[2]))
  }
}

const getCurrentTimeParts = (): TimeParts => {
  const now = new Date()
  return {
    hour: now.getHours(),
    minute: normalizeMinute(now.getMinutes())
  }
}

const formatTimeValue = ({ hour, minute }: TimeParts): string => `${padTimePart(hour)}:${padTimePart(minute)}`

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const slotItemHeight = 32
const visibleSlotPadding = 2
const hourOptions = Array.from({ length: 24 }, (_, value) => value)
const minuteOptions = Array.from({ length: 6 }, (_, value) => value * 10)

type TimePartKey = keyof TimeParts

export function TimePickerInput({
  value,
  ariaLabel,
  className,
  onValueChange
}: TimePickerInputProps) {
  const timeParts = parseTimeValue(value)
  const hourSlotRef = useRef<HTMLDivElement>(null)
  const minuteSlotRef = useRef<HTMLDivElement>(null)
  const latestTimePartsRef = useRef(timeParts)
  const [currentTimeParts, setCurrentTimeParts] = useState(getCurrentTimeParts)
  const rootClassName = ['time-picker-input', className].filter(Boolean).join(' ')
  const normalizedValue = formatTimeValue(timeParts)

  useEffect(() => {
    latestTimePartsRef.current = timeParts

    if (value !== normalizedValue) {
      onValueChange(normalizedValue)
    }
  }, [timeParts.hour, timeParts.minute])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeParts(getCurrentTimeParts())
    }, 60 * 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  const updateTimePart = (part: TimePartKey, nextValue: number) => {
    const currentParts = latestTimePartsRef.current
    if (currentParts[part] === nextValue) {
      return
    }

    const nextParts = { ...currentParts, [part]: nextValue }
    latestTimePartsRef.current = nextParts
    onValueChange(formatTimeValue(nextParts))
  }

  const moveTimePart = (part: TimePartKey, values: number[], offset: number) => {
    const currentValue = latestTimePartsRef.current[part]
    const currentIndex = Math.max(values.indexOf(currentValue), 0)
    const nextIndex = clamp(currentIndex + offset, 0, values.length - 1)
    const nextValue = values[nextIndex]

    updateTimePart(part, nextValue)
  }

  const handleSlotWheel = (part: TimePartKey, values: number[], event: globalThis.WheelEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.deltaY === 0) {
      return
    }

    moveTimePart(part, values, Math.sign(event.deltaY))
  }

  useEffect(() => {
    const hourSlot = hourSlotRef.current
    const minuteSlot = minuteSlotRef.current
    const handleHourWheel = (event: globalThis.WheelEvent) => handleSlotWheel('hour', hourOptions, event)
    const handleMinuteWheel = (event: globalThis.WheelEvent) => handleSlotWheel('minute', minuteOptions, event)

    hourSlot?.addEventListener('wheel', handleHourWheel, { passive: false })
    minuteSlot?.addEventListener('wheel', handleMinuteWheel, { passive: false })

    return () => {
      hourSlot?.removeEventListener('wheel', handleHourWheel)
      minuteSlot?.removeEventListener('wheel', handleMinuteWheel)
    }
  })

  const handleSlotKeyDown = (part: TimePartKey, values: number[], event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveTimePart(part, values, 1)
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveTimePart(part, values, -1)
    }
  }

  const renderSlot = (
    part: TimePartKey,
    label: string,
    unit: string,
    values: number[],
    selectedValue: number,
    ref: RefObject<HTMLDivElement | null>
  ) => {
    const selectedIndex = Math.max(values.indexOf(selectedValue), 0)

    return (
      <div className="time-slot-shell">
        <div className="time-slot-viewport">
          <div
            ref={ref}
            className="time-slot-window"
            role="listbox"
            aria-label={`${ariaLabel}の${label}`}
            tabIndex={0}
            onKeyDown={(event) => handleSlotKeyDown(part, values, event)}
          >
            <div
              className="time-slot-list"
              style={{ transform: `translateY(${(visibleSlotPadding - selectedIndex) * slotItemHeight}px)` }}
            >
              {values.map(slotValue => (
                <button
                  key={slotValue}
                  type="button"
                  className={[
                    'time-slot-option',
                    slotValue === selectedValue ? 'time-slot-option-selected' : '',
                    slotValue === currentTimeParts[part] ? 'time-slot-option-current' : ''
                  ].filter(Boolean).join(' ')}
                  role="option"
                  aria-selected={slotValue === selectedValue}
                  tabIndex={-1}
                  onClick={() => updateTimePart(part, slotValue)}
                >
                  {padTimePart(slotValue)}
                </button>
              ))}
            </div>
          </div>
          <span className="time-slot-marker" aria-hidden="true" />
          <span className="time-slot-fade" aria-hidden="true" />
        </div>
        <span className="time-slot-unit">{unit}</span>
      </div>
    )
  }

  return (
    <div className={rootClassName} role="group" aria-label={ariaLabel}>
      {renderSlot('hour', '時', '時', hourOptions, timeParts.hour, hourSlotRef)}
      <span className="time-picker-separator" aria-hidden="true">:</span>
      {renderSlot('minute', '分', '分', minuteOptions, timeParts.minute, minuteSlotRef)}
    </div>
  )
}
