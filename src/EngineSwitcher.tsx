import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Check, ChevronDown, Plus, RefreshCw, Server, Trash2, X } from 'lucide-react'
import {
  discoverEngines,
  getActiveEngine,
  getActiveEngineId,
  getAllEngineStatuses,
  getEngines,
  hasEngineBearerToken,
  removeCustomEngine,
  setActiveEngineId,
  subscribeEngines,
  upsertCustomEngine,
} from './api'
import type { EngineAuthMode, EngineNode, EngineStatus } from './types'

function formatUptime(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatMemory(status?: EngineStatus): string {
  const m = status?.metrics
  if (!m) return '—'
  if (typeof m.memoryPercent === 'number') return `${m.memoryPercent.toFixed(1)}%`
  if (typeof m.memoryUsedBytes === 'number') {
    const gb = m.memoryUsedBytes / (1024 * 1024 * 1024)
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(m.memoryUsedBytes / (1024 * 1024))} MB`
  }
  return '—'
}

export function useEngines(configEngines?: unknown[]) {
  const engines = useSyncExternalStore(subscribeEngines, getEngines, getEngines)
  const activeEngineId = useSyncExternalStore(subscribeEngines, getActiveEngineId, getActiveEngineId)
  const activeEngine = getActiveEngine()

  const [statuses, setStatuses] = useState<Record<string, EngineStatus>>({})
  const [refreshing, setRefreshing] = useState(false)

  const refreshStatuses = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await getAllEngineStatuses()
      setStatuses(next)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void discoverEngines(configEngines).then(() => {
      if (active) void refreshStatuses()
    })
    return () => { active = false }
  }, [configEngines, refreshStatuses])

  return {
    engines,
    activeEngine,
    activeEngineId,
    statuses,
    refreshing,
    selectEngine: setActiveEngineId,
    refreshStatuses,
    addOrUpdateEngine: upsertCustomEngine,
    deleteEngine: removeCustomEngine,
  }
}

interface AddEngineModalProps {
  initial?: EngineNode | null
  onClose: () => void
  onSaved: (node: EngineNode) => void
}

function EngineFormModal({ initial, onClose, onSaved }: AddEngineModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '')
  const [authMode, setAuthMode] = useState<EngineAuthMode>(initial?.authMode ?? 'access')
  const [bearerToken, setBearerToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanUrl = url.trim()
    if (!cleanName || !cleanUrl) {
      setError('กรุณาระบุชื่อ Engine และ URL หรือ Proxy Path')
      return
    }
    if (!/^(\/|https?:\/\/)/i.test(cleanUrl)) {
      setError('URL ต้องขึ้นต้นด้วย https://, http:// หรือ relative path เช่น /engine/by/beta')
      return
    }
    const saved = upsertCustomEngine({
      id: initial?.id,
      name: cleanName,
      url: cleanUrl,
      subtitle: subtitle.trim() || undefined,
      authMode,
      bearerToken: authMode === 'bearer' ? bearerToken : undefined,
    })
    onSaved(saved)
  }

  return (
    <div className="logout-confirm-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form
        className="logout-confirm-dialog engine-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="engine-modal-head">
          <h2>{initial ? 'ตั้งค่า Engine' : 'เพิ่ม AIxodia Engine'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <div className="error-banner"><span>{error}</span></div>}

        <div className="engine-form-fields">
          <label className="engine-field">
            <span>ชื่อ Engine</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น instabox-beta"
              required
            />
          </label>

          <label className="engine-field">
            <span>Base URL หรือ Proxy Path</span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/engine/by/beta หรือ https://engine-2.aixodia.dpdns.org"
              required
            />
          </label>

          <label className="engine-field">
            <span>โหมดยืนยันตัวตน</span>
            <select
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value === 'bearer' ? 'bearer' : 'access')}
            >
              <option value="access">Cloudflare Access Cookie (/auth/token)</option>
              <option value="bearer">Direct Bearer Token (เก็บเฉพาะในหน่วยความจำ)</option>
            </select>
          </label>

          {authMode === 'bearer' && (
            <label className="engine-field">
              <span>Bearer Token (ไม่บันทึกลง localStorage)</span>
              <input
                type="password"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder={initial && hasEngineBearerToken(initial.id) ? 'ตั้งค่าไว้ในหน่วยความจำแล้ว' : 'ใส่ Engine session/bearer token'}
                autoComplete="off"
              />
            </label>
          )}

          <label className="engine-field">
            <span>คำอธิบายเพิ่มเติม (ไม่บังคับ)</span>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="เช่น Debian 13 · x86_64"
            />
          </label>
        </div>

        <div className="logout-confirm-actions">
          <button type="button" className="logout-confirm-cancel" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="action-button primary">
            {initial ? 'บันทึก' : 'เพิ่ม Engine'}
          </button>
        </div>
      </form>
    </div>
  )
}

export interface EngineSwitcherProps {
  configEngines?: unknown[]
  onEngineChanged?: (engine: EngineNode) => void
}

export function EngineSwitcher({ configEngines, onEngineChanged }: EngineSwitcherProps) {
  const {
    engines,
    activeEngine,
    statuses,
    refreshing,
    selectEngine,
    refreshStatuses,
    deleteEngine,
  } = useEngines(configEngines)

  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const activeStatus = statuses[activeEngine.id]
  const isOnline = activeStatus?.online === true

  const handleSelect = (eng: EngineNode) => {
    const chosen = selectEngine(eng.id)
    setOpen(false)
    onEngineChanged?.(chosen)
  }

  return (
    <div className="engine-switcher" data-aixodia-engine-switcher="true">
      <button
        type="button"
        className="engine-switcher-trigger"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={`state-dot ${isOnline ? 'is-online-dot' : ''}`} />
        <Server size={14} />
        <span className="engine-switcher-label">{activeEngine.name}</span>
        <span className="engine-switcher-badge">{engines.length}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="engine-switcher-popover" role="menu">
          <div className="engine-switcher-head">
            <span>AIXODIA ENGINES ({engines.length})</span>
            <button
              type="button"
              className="icon-action"
              onClick={() => void refreshStatuses()}
              title="ตรวจสถานะทุก Engine"
            >
              <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            </button>
          </div>

          <div className="engine-switcher-list">
            {engines.map((eng) => {
              const st = statuses[eng.id]
              const selected = eng.id === activeEngine.id
              return (
                <div
                  key={eng.id}
                  className={`engine-switcher-row ${selected ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="engine-switcher-item"
                    onClick={() => handleSelect(eng)}
                  >
                    <span className={`state-dot ${st?.online ? 'is-online-dot' : ''}`} />
                    <span className="engine-switcher-copy">
                      <strong>{eng.name}</strong>
                      <small>{eng.host || eng.url}</small>
                    </span>
                    {selected && <Check size={14} />}
                  </button>
                  {eng.source === 'custom' && engines.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => deleteEngine(eng.id)}
                      title="ลบ Engine"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <button
            type="button"
            className="action-button secondary engine-switcher-add"
            onClick={() => {
              setOpen(false)
              setModalOpen(true)
            }}
          >
            <Plus size={14} />
            <span>เพิ่ม Engine ใหม่</span>
          </button>
        </div>
      )}

      {modalOpen && (
        <EngineFormModal
          onClose={() => setModalOpen(false)}
          onSaved={(node) => {
            setModalOpen(false)
            void refreshStatuses()
            onEngineChanged?.(node)
          }}
        />
      )}
    </div>
  )
}

export interface EngineFleetPanelProps {
  configEngines?: unknown[]
  onOpenChat?: (engineId: string) => void
}

export function EngineFleetPanel({ configEngines, onOpenChat }: EngineFleetPanelProps) {
  const {
    engines,
    activeEngine,
    statuses,
    refreshing,
    selectEngine,
    refreshStatuses,
    deleteEngine,
  } = useEngines(configEngines)

  const [editing, setEditing] = useState<EngineNode | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <section className="service-card engine-fleet-card">
      <div className="service-card-head">
        <div className="service-card-identity">
          <div className="service-icon engine-icon">
            <Server size={20} />
          </div>
          <div className="service-heading">
            <p className="eyebrow">MULTI-ENGINE FLEET</p>
            <h2>AIxodia Engines ({engines.length})</h2>
            <p className="service-description">
              สลับการเชื่อมต่อและตรวจสอบสถานะ CPU / Memory / Uptime แยกตามแต่ละ Engine
            </p>
          </div>
        </div>

        <div className="panel-actions">
          <button
            type="button"
            className="icon-action"
            onClick={() => void refreshStatuses()}
            title="รีเฟรชสถานะทุก Engine"
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
          </button>
          <button
            type="button"
            className="action-button primary"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} />
            <span>เพิ่ม Engine</span>
          </button>
        </div>
      </div>

      <div className="engine-fleet-grid">
        {engines.map((eng) => {
          const st = statuses[eng.id]
          const isSelected = eng.id === activeEngine.id
          const online = st?.online === true
          const cpu = st?.metrics?.cpuPercent
          return (
            <article
              key={eng.id}
              className={`engine-fleet-item ${isSelected ? 'is-active' : ''}`}
            >
              <div className="engine-fleet-top">
                <div>
                  <strong>{eng.name}</strong>
                  <small>{eng.host || eng.url}</small>
                </div>
                <span className={`connection-state ${online ? 'is-online' : 'is-offline'}`}>
                  <span className="state-dot" />
                  {online ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="engine-metrics">
                <div className="metric-stat">
                  <span className="metric-label">Uptime</span>
                  <strong>{formatUptime(st?.uptimeSeconds)}</strong>
                </div>
                <div className="metric-stat">
                  <span className="metric-label">CPU</span>
                  <strong>{typeof cpu === 'number' ? `${cpu.toFixed(1)}%` : '—'}</strong>
                </div>
                <div className="metric-stat">
                  <span className="metric-label">Memory</span>
                  <strong>{formatMemory(st)}</strong>
                </div>
              </div>

              <div className="service-card-foot">
                <span className="updated-at">{st?.version || eng.subtitle || eng.source}</span>
                <div className="panel-actions">
                  {!isSelected ? (
                    <button
                      type="button"
                      className="action-button secondary"
                      onClick={() => selectEngine(eng.id)}
                    >
                      เลือกใช้งาน
                    </button>
                  ) : (
                    onOpenChat && (
                      <button
                        type="button"
                        className="action-button primary"
                        onClick={() => onOpenChat(eng.id)}
                      >
                        เปิด Chat
                      </button>
                    )
                  )}
                  {eng.source === 'custom' && (
                    <>
                      <button
                        type="button"
                        className="action-button secondary"
                        onClick={() => setEditing(eng)}
                      >
                        แก้ไข
                      </button>
                      {engines.length > 1 && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => deleteEngine(eng.id)}
                          title="ลบ Engine"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {(adding || editing) && (
        <EngineFormModal
          initial={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSaved={() => {
            setAdding(false)
            setEditing(null)
            void refreshStatuses()
          }}
        />
      )}
    </section>
  )
}
