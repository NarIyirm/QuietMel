import { useEffect, useRef } from 'react'
import { Activity, ArrowRight, Clock3, MapPin, Route, UsersRound, X } from 'lucide-react'
import type { LanguageChoice } from './AppSettings'

type LandingIntroProps = {
  open: boolean
  language: LanguageChoice
  onClose: () => void
}

const copy = {
  en: {
    close: 'Close introduction',
    eyebrow: 'Calmer city journeys, with less uncertainty',
    title: 'Plan a calmer walk through Melbourne.',
    summary: 'QuietMel helps neurodivergent people understand crowd activity and choose walking routes with fewer busy areas.',
    audience: 'Designed for people who may find crowded, noisy or unpredictable places overwhelming.',
    action: 'Open the QuietMel map',
    panelTitle: 'How QuietMel helps',
    liveTitle: 'Check crowd levels now',
    liveBody: 'See current pedestrian activity across the city.',
    forecastTitle: 'Preview the next six hours',
    forecastBody: 'Understand when an area may become busier or calmer.',
    routeTitle: 'Compare quieter routes',
    routeBody: 'Balance walking time with exposure to busy places.',
    data: 'Powered by City of Melbourne pedestrian sensor data',
  },
  'zh-CN': {
    close: '关闭项目介绍',
    eyebrow: '减少不确定感，更从容地穿行城市',
    title: '在墨尔本规划一段更平静的步行。',
    summary: 'QuietMel 帮助神经多样性人群了解人流情况，并选择经过较少拥挤区域的步行路线。',
    audience: '专为容易受到拥挤、噪音或不可预测环境影响的人群设计。',
    action: '打开 QuietMel 地图',
    panelTitle: 'QuietMel 如何提供帮助',
    liveTitle: '查看当前人流',
    liveBody: '了解城市各处当前的行人活动。',
    forecastTitle: '预览未来六小时',
    forecastBody: '了解一个区域何时可能变得更拥挤或更安静。',
    routeTitle: '比较更安静的路线',
    routeBody: '在步行时间和拥挤环境暴露之间取得平衡。',
    data: '数据来自 City of Melbourne 行人传感器',
  },
} as const

export function LandingIntro({ open, language, onClose }: LandingIntroProps) {
  const primaryActionRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const text = copy[language]

  useEffect(() => {
    if (!open) return
    primaryActionRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="landing-intro">
      <section
        ref={dialogRef}
        className="landing-intro__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-intro-title"
        aria-describedby="landing-intro-summary"
      >
        <button className="landing-intro__close" type="button" aria-label={text.close} onClick={onClose}>
          <X aria-hidden="true" size={21} />
        </button>

        <div className="landing-intro__hero">
          <div className="landing-intro__brand" aria-label="QuietMel">
            <span aria-hidden="true"><MapPin size={20} strokeWidth={2.2} /></span>
            <strong>QuietMel</strong>
          </div>
          <div className="landing-intro__message">
            <p className="landing-intro__eyebrow">{text.eyebrow}</p>
            <h1 id="landing-intro-title">{text.title}</h1>
            <p id="landing-intro-summary" className="landing-intro__summary">{text.summary}</p>
            <p className="landing-intro__audience"><UsersRound aria-hidden="true" size={18} />{text.audience}</p>
          </div>
          <button ref={primaryActionRef} className="landing-intro__action" type="button" onClick={onClose}>
            <span>{text.action}</span>
            <ArrowRight aria-hidden="true" size={19} />
          </button>
        </div>

        <div className="landing-intro__capabilities">
          <div className="landing-intro__capability-content">
            <h2>{text.panelTitle}</h2>
            <div className="landing-intro__feature-list">
              <article>
                <span><Activity aria-hidden="true" /></span>
                <div><h3>{text.liveTitle}</h3><p>{text.liveBody}</p></div>
              </article>
              <article>
                <span><Clock3 aria-hidden="true" /></span>
                <div><h3>{text.forecastTitle}</h3><p>{text.forecastBody}</p></div>
              </article>
              <article>
                <span><Route aria-hidden="true" /></span>
                <div><h3>{text.routeTitle}</h3><p>{text.routeBody}</p></div>
              </article>
            </div>
            <p className="landing-intro__data"><span aria-hidden="true" />{text.data}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
