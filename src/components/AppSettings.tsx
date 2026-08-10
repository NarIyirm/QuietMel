import { BookOpen, Check, CircleHelp, Palette, Settings2, X } from 'lucide-react'

export type ThemeChoice = 'original' | 'dark'
export type LanguageChoice = 'en' | 'zh-CN'

type AppSettingsProps = {
  open: boolean
  theme: ThemeChoice
  language: LanguageChoice
  onClose: () => void
  onThemeChange: (theme: ThemeChoice) => void
  onLanguageChange: (language: LanguageChoice) => void
  onRestartTutorial: () => void
}

const themes: Array<{ id: ThemeChoice; label: string; color: string }> = [
  { id: 'original', label: 'Original', color: '#087c78' },
  { id: 'dark', label: 'Dark', color: '#263139' },
]

export function AppSettings({
  open,
  theme,
  language,
  onClose,
  onThemeChange,
  onLanguageChange,
  onRestartTutorial,
}: AppSettingsProps) {
  if (!open) return null
  const chinese = language === 'zh-CN'

  return (
    <div className="app-settings" role="presentation" onPointerDown={onClose}>
      <section
        className="app-settings__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><Settings2 aria-hidden="true" /><h2 id="settings-title">{chinese ? '设置' : 'Settings'}</h2></div>
          <button type="button" aria-label={chinese ? '关闭设置' : 'Close settings'} onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <section className="app-settings__section" aria-labelledby="theme-title">
          <div className="app-settings__section-title"><Palette aria-hidden="true" /><h3 id="theme-title">{chinese ? '主题' : 'Theme'}</h3></div>
          <div className="app-settings__themes" role="radiogroup" aria-label={chinese ? '主题' : 'Theme'}>
            {themes.map((option) => (
              <button key={option.id} type="button" role="radio" aria-checked={theme === option.id}
                className={`app-settings__theme${theme === option.id ? ' app-settings__theme--selected' : ''}`}
                onClick={() => onThemeChange(option.id)}>
                <span style={{ backgroundColor: option.color }} aria-hidden="true" />
                {chinese ? option.id === 'original' ? '原始' : '深色' : option.label}
                {theme === option.id ? <Check aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="app-settings__section" aria-labelledby="language-title">
          <h3 id="language-title">{chinese ? '语言' : 'Language'}</h3>
          <select value={language} onChange={(event) => onLanguageChange(event.target.value as LanguageChoice)}>
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </section>

        <section className="app-settings__section app-settings__tutorial">
          <div><BookOpen aria-hidden="true" /><div><h3>{chinese ? '地图教程' : 'Map tutorial'}</h3><p>{chinese ? '随时重新查看地图核心操作。' : 'Review the key map controls at any time.'}</p></div></div>
          <button type="button" onClick={onRestartTutorial}>{chinese ? '开始教程' : 'Start tutorial'}</button>
        </section>

        <section className="app-settings__section app-settings__help">
          <div>
            <CircleHelp aria-hidden="true" />
            <div>
              <h3>{chinese ? '帮助中心' : 'Help centre'}</h3>
              <p>{chinese ? '阅读地图、数据和路线规划手册。' : 'Read guides for the map, data and route planning.'}</p>
            </div>
          </div>
          <a href="/help">{chinese ? '打开帮助' : 'Open help'}</a>
        </section>
      </section>
    </div>
  )
}
