import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Menu,
  X,
} from 'lucide-react'

import type { LanguageChoice, ThemeChoice } from './AppSettings'
import '../styles/help.css'

type HelpManual = {
  id: string
  title: string
  titleZh: string
  summary: string
  summaryZh: string
  pages: number
  updatedAt: string
}

type ManualAccess = {
  id: string
  url: string
  expiresAt: string
}

export function HelpLibrary() {
  const [manuals, setManuals] = useState<HelpManual[]>([])
  const [activeManualId, setActiveManualId] = useState<string | null>(null)
  const [manualAccessById, setManualAccessById] = useState<Record<string, ManualAccess>>({})
  const [catalogueLoading, setCatalogueLoading] = useState(true)
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)
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

  useEffect(() => {
    const controller = new AbortController()

    void fetch('/api/help/manuals', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('The help manual catalogue could not be loaded.')
        return response.json() as Promise<{ manuals: HelpManual[] }>
      })
      .then((catalogue) => {
        setManuals(catalogue.manuals)
        setActiveManualId((current) => current ?? catalogue.manuals[0]?.id ?? null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setCatalogueError(error instanceof Error ? error.message : 'Help manuals are unavailable.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogueLoading(false)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!activeManualId) return
    const cachedAccess = manualAccessById[activeManualId]
    if (cachedAccess && Date.parse(cachedAccess.expiresAt) > Date.now() + 60_000) return
    const controller = new AbortController()

    void fetch(`/api/help/manuals/${encodeURIComponent(activeManualId)}/access`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('The selected manual could not be opened.')
        return response.json() as Promise<ManualAccess>
      })
      .then((access) => {
        setManualAccessById((current) => ({ ...current, [access.id]: access }))
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setManualError(error instanceof Error ? error.message : 'The selected manual is unavailable.')
      })

    return () => controller.abort()
  }, [activeManualId, manualAccessById])

  const activeManual = useMemo(
    () => manuals.find((manual) => manual.id === activeManualId) ?? null,
    [activeManualId, manuals],
  )
  const activeTitle = activeManual
    ? chinese ? activeManual.titleZh : activeManual.title
    : chinese ? '帮助手册' : 'Help manuals'
  const activeManualUrl = activeManualId ? manualAccessById[activeManualId]?.url : undefined

  function selectManual(id: string) {
    setManualError(null)
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
              <span>{catalogueLoading
                ? chinese ? '正在载入…' : 'Loading guides...'
                : chinese ? `共 ${manuals.length} 份简短指南` : `${manuals.length} short guides`}</span>
            </div>
          </div>
          <nav>
            {catalogueError ? <p className="help-library__catalogue-error" role="alert">{catalogueError}</p> : null}
            {manuals.map((manual) => {
              const selected = activeManual?.id === manual.id
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
              {activeManualUrl ? (
                <>
                  <a href={activeManualUrl} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" />
                    <span>{chinese ? '新窗口打开' : 'Open'}</span>
                  </a>
                  <a href={activeManualUrl} target="_blank" rel="noreferrer">
                    <Download aria-hidden="true" />
                    <span>{chinese ? '下载' : 'Download'}</span>
                  </a>
                </>
              ) : null}
            </div>
          </header>
          <div className="help-library__pdf-shell">
            {catalogueLoading || (activeManualId && !activeManualUrl && !manualError) ? (
              <div className="help-library__reader-status" role="status">
                <LoaderCircle className="help-library__reader-loader" aria-hidden="true" />
                <p>{chinese ? '正在从数据库载入手册…' : 'Loading the manual from the database...'}</p>
              </div>
            ) : manualError || catalogueError ? (
              <div className="help-library__reader-status" role="alert">
                <FileText aria-hidden="true" />
                <p>{manualError ?? catalogueError}</p>
              </div>
            ) : activeManualUrl ? (
              <object key={activeManualUrl} data={`${activeManualUrl}#view=FitH`} type="application/pdf">
                <div className="help-library__pdf-fallback">
                  <FileText aria-hidden="true" />
                  <p>{chinese ? '当前浏览器无法在页面内显示 PDF。' : 'This browser cannot display the PDF inside the page.'}</p>
                  <a href={activeManualUrl} target="_blank" rel="noreferrer">
                    {chinese ? '打开 PDF 手册' : 'Open the PDF manual'}
                  </a>
                </div>
              </object>
            ) : (
              <div className="help-library__reader-status">
                <BookOpen aria-hidden="true" />
                <p>{chinese ? '请选择一份手册。' : 'Choose a manual to begin.'}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
