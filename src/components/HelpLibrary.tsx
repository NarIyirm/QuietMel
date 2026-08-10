import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Menu,
  X,
} from 'lucide-react'

import type { LanguageChoice, ThemeChoice } from './AppSettings'
import '../styles/help.css'

type HelpManual = {
  id: string
  file: string
  title: string
  titleZh: string
  summary: string
  summaryZh: string
  pages: number
}

const manuals: HelpManual[] = [
  {
    id: 'quick-start',
    file: '/help/quietmel-quick-start.pdf',
    title: 'Quick start',
    titleZh: '快速开始',
    summary: 'Location, map controls and the first quiet route.',
    summaryZh: '定位、地图控件和第一次安静路线规划。',
    pages: 2,
  },
  {
    id: 'map-data',
    file: '/help/quietmel-map-and-crowd-data.pdf',
    title: 'Map and crowd data',
    titleZh: '地图与人流数据',
    summary: 'Live layers, sensor readings and the six-hour forecast.',
    summaryZh: '实时图层、传感器读数和未来六小时预测。',
    pages: 2,
  },
  {
    id: 'routes',
    file: '/help/quietmel-routes-and-quiet-places.pdf',
    title: 'Routes and quiet places',
    titleZh: '路线与安静地点',
    summary: 'Route alternatives, navigation and nearby quiet places.',
    summaryZh: '路线备选、导航和附近安静地点。',
    pages: 2,
  },
]

export function HelpLibrary() {
  const [activeManualId, setActiveManualId] = useState(manuals[0].id)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [language] = useState<LanguageChoice>(() =>
    localStorage.getItem('quietmel:language') === 'zh-CN' ? 'zh-CN' : 'en',
  )
  const chinese = language === 'zh-CN'

  useEffect(() => {
    const storedTheme: ThemeChoice = localStorage.getItem('quietmel:theme') === 'dark'
      ? 'dark'
      : 'original'
    document.documentElement.dataset.theme = storedTheme
    document.documentElement.lang = language
  }, [language])

  const activeManual = useMemo(
    () => manuals.find((manual) => manual.id === activeManualId) ?? manuals[0],
    [activeManualId],
  )
  const activeTitle = chinese ? activeManual.titleZh : activeManual.title

  function selectManual(id: string) {
    setActiveManualId(id)
    setSidebarOpen(false)
  }

  return (
    <main className="help-library">
      <header className="help-library__topbar">
        <a className="help-library__back" href="/" aria-label={chinese ? '返回地图' : 'Back to map'}>
          <ArrowLeft aria-hidden="true" />
          <span>{chinese ? '返回地图' : 'Back to map'}</span>
        </a>
        <div className="help-library__brand">
          <span aria-hidden="true">Q</span>
          <div>
            <strong>{chinese ? 'QuietMel 帮助中心' : 'QuietMel help centre'}</strong>
            <small>{chinese ? '使用指南与功能说明' : 'Guides and feature notes'}</small>
          </div>
        </div>
        <button
          type="button"
          className="help-library__menu-button"
          aria-expanded={sidebarOpen}
          aria-controls="help-manuals"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span>{chinese ? '手册' : 'Manuals'}</span>
        </button>
      </header>

      <div className="help-library__body">
        {sidebarOpen ? (
          <button
            type="button"
            className="help-library__scrim"
            aria-label={chinese ? '关闭手册列表' : 'Close manual list'}
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <aside
          id="help-manuals"
          className={`help-library__sidebar${sidebarOpen ? ' help-library__sidebar--open' : ''}`}
          aria-label={chinese ? '帮助文档' : 'Help manuals'}
        >
          <div className="help-library__sidebar-heading">
            <BookOpen aria-hidden="true" />
            <div>
              <strong>{chinese ? '选择手册' : 'Choose a manual'}</strong>
              <span>{chinese ? '共 3 份简短指南' : 'Three short guides'}</span>
            </div>
          </div>
          <nav>
            {manuals.map((manual) => {
              const selected = activeManual.id === manual.id
              return (
                <button
                  key={manual.id}
                  type="button"
                  className={selected ? 'help-library__manual--active' : undefined}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => selectManual(manual.id)}
                >
                  <FileText aria-hidden="true" />
                  <span>
                    <strong>{chinese ? manual.titleZh : manual.title}</strong>
                    <small>{chinese ? manual.summaryZh : manual.summary}</small>
                    <em>{manual.pages} {chinese ? '页' : 'pages'}</em>
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="help-library__reader" aria-labelledby="active-manual-title">
          <header>
            <div>
              <span>{chinese ? '当前手册' : 'Current manual'}</span>
              <h1 id="active-manual-title">{activeTitle}</h1>
            </div>
            <div className="help-library__reader-actions">
              <a href={activeManual.file} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                <span>{chinese ? '新窗口打开' : 'Open'}</span>
              </a>
              <a href={activeManual.file} download>
                <Download aria-hidden="true" />
                <span>{chinese ? '下载' : 'Download'}</span>
              </a>
            </div>
          </header>
          <div className="help-library__pdf-shell">
            <object key={activeManual.file} data={`${activeManual.file}#view=FitH`} type="application/pdf">
              <div className="help-library__pdf-fallback">
                <FileText aria-hidden="true" />
                <p>{chinese ? '当前浏览器无法在页面内显示 PDF。' : 'This browser cannot display the PDF inside the page.'}</p>
                <a href={activeManual.file} target="_blank" rel="noreferrer">
                  {chinese ? '打开 PDF 手册' : 'Open the PDF manual'}
                </a>
              </div>
            </object>
          </div>
        </section>
      </div>
    </main>
  )
}
