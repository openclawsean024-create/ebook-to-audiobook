'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

type ConversionStatus = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  title?: string
  summary?: string
  summary_word_count?: number
  audio_url?: string
  chapter_audios?: Array<{ title: string; url: string; index: number }>
}

type UploadError = {
  code: string
  message: string
}

type ClonedVoice = {
  id: string
  elevenlabs_voice_id: string
  name: string
  audio_sample_url: string
  created_at: string
}

const ERROR_MESSAGES: Record<string, string> = {
  NO_FILE:            '請選擇要上傳的電子書檔案',
  UNSUPPORTED_FORMAT: '抱歉，目前不支援這個檔案格式，請上傳 EPUB、PDF 或 TXT',
  FILE_TOO_LARGE:     '檔案大小不能超過 50MB',
  UPLOAD_FAILED:      '上傳失敗，請稍後重試',
  PARSE_ERROR:        '無法讀取這個檔案的內容，請確認檔案未加密或損壞',
  SUMMARIZE_ERROR:    'AI 摘要失敗，請稍後重試',
}

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.epub', '.pdf', '.txt']
const ALLOWED_MIME_TYPES = [
  'application/epub+zip',
  'application/pdf',
  'text/plain',
  'application/octet-stream',
]

const VOICES = [
  { id: 'eleven_multilingual_v2', label: 'Eleven Multilingual v2 (推薦)' },
  { id: 'eleven_english_v2', label: 'Eleven English v2' },
  { id: 'eleven_monolingual_v2', label: 'Eleven Monolingual v2' },
]

const PIPELINE_STEPS = [
  { label: '上傳檔案' },
  { label: '提取文字' },
  { label: 'AI 智能摘要' },
  { label: '生成語音' },
]

function getPipelineStep(uploading: boolean, uploadProgress: number, conversion: ConversionStatus | null): number {
  if (!uploading && !conversion) return -1
  if (uploading && uploadProgress < 100) return 0
  if (!conversion) return 0
  if (conversion.progress < 20) return 1
  if (conversion.progress < 50) return 2
  if (conversion.status !== 'completed' && conversion.status !== 'failed') return 3
  return 4
}

export default function ConverterPage() {
  const supabase = createClient()
  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null)
  const [plan, setPlan] = useState<string>('free')
  const [apiKeyNeeded, setApiKeyNeeded] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [voice, setVoice] = useState('eleven_multilingual_v2')
  const [rate, setRate] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [conversion, setConversion] = useState<ConversionStatus | null>(null)
  const [uploadError, setUploadError] = useState<UploadError | null>(null)
  const [voiceLabOpen, setVoiceLabOpen] = useState(false)
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([])
  const [cloneAudio, setCloneAudio] = useState<File | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [cloneSuccess, setCloneSuccess] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewText, setPreviewText] = useState('')

  const audioInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('plan, elevenlabs_api_key').eq('id', data.user.id).single().then(({ data: profile }) => {
          if (profile) {
            setPlan(profile.plan || 'free')
            if (!profile.elevenlabs_api_key && profile.plan !== 'free') setApiKeyNeeded(true)
          }
        })
      }
    })
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (!voiceLabOpen || !user) return
    fetch('/api/voices').then(r => r.json()).then(data => { if (Array.isArray(data)) setClonedVoices(data) }).catch(() => {})
  }, [voiceLabOpen, user])

  const pollConversion = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/conversions/${jobId}`)
    if (!res.ok) return
    const data: ConversionStatus = await res.json()
    setConversion(data)
    if (data.status === 'completed' || data.status === 'failed') {
      if (pollRef.current) clearInterval(pollRef.current)
      setConverting(false)
    }
  }, [])

  function validateFile(f: File): UploadError | null {
    const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '')
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES.includes(f.type)) {
      return { code: 'UNSUPPORTED_FORMAT', message: ERROR_MESSAGES.UNSUPPORTED_FORMAT }
    }
    if (f.size > MAX_FILE_SIZE) {
      return { code: 'FILE_TOO_LARGE', message: ERROR_MESSAGES.FILE_TOO_LARGE }
    }
    return null
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const f = e.target.files?.[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setUploadError(err); setFile(null); return }
    setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    setUploadError(null)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    const err = validateFile(f)
    if (err) { setUploadError(err); setFile(null); return }
    setFile(f)
  }

  const handleConvert = async () => {
    if (!file || !user) return
    setUploadError(null)
    setConversion(null)
    setConverting(true)
    setUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('voice', voice)

    try {
      const data = await new Promise<{ id: string; summary?: string; status?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/conversions')

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }

        xhr.onload = () => {
          setUploading(false)
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const err = JSON.parse(xhr.responseText)
              reject(new Error(err.code || err.error || 'UPLOAD_FAILED'))
            } catch {
              reject(new Error('UPLOAD_FAILED'))
            }
          }
        }

        xhr.onerror = () => { setUploading(false); reject(new Error('UPLOAD_FAILED')) }
        xhr.send(formData)
      })

      setUploadProgress(100)

      // Free tier completes synchronously with summary for browser TTS
      if (data.status === 'completed' && data.summary) {
        setConversion({ id: data.id, status: 'completed', progress: 100, message: '摘要完成', summary: data.summary })
        setConverting(false)
        return
      }

      setConversion({ id: data.id, status: 'queued', progress: 10, message: '已排入佇列...' })
      pollRef.current = setInterval(() => pollConversion(data.id), 2000)
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'UPLOAD_FAILED'
      setUploadError({ code, message: ERROR_MESSAGES[code] || ERROR_MESSAGES.UPLOAD_FAILED })
      setConverting(false)
      setUploading(false)
    }
  }

  const handlePreview = () => {
    if (!previewText || previewing) return
    setPreviewing(true)
    const utterance = new SpeechSynthesisUtterance(previewText)
    utterance.lang = voice.includes('english') ? 'en-US' : 'zh-CN'
    utterance.rate = rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    utterance.onend = () => setPreviewing(false)
    utterance.onerror = () => setPreviewing(false)
  }

  const handlePlaySummary = () => {
    if (!conversion?.summary) return
    setPreviewing(true)
    const utterance = new SpeechSynthesisUtterance(conversion.summary)
    utterance.rate = rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    utterance.onend = () => setPreviewing(false)
    utterance.onerror = () => setPreviewing(false)
  }

  const activeStep = getPipelineStep(uploading, uploadProgress, conversion)

  return (
    <div className="min-h-screen bg-amber-50">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto">

          {apiKeyNeeded && (
            <div className="mb-6 p-4 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 text-sm flex items-start gap-3">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <strong>Pro/Business 方案需要 API 金鑰</strong>
                <p className="mt-1 text-amber-700">
                  在 <Link href="/settings" className="underline">設定頁</Link> 新增 ElevenLabs API 金鑰以啟用 MP3 下載。
                  免費方案使用瀏覽器語音（僅預覽）。
                </p>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">電子書轉 20 分鐘有聲書</h1>
            <p className="text-stone-500 text-sm">上傳電子書 → Claude AI 自動濃縮重點 → 生成約 20 分鐘 MP3</p>
          </div>

          {/* File Upload */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-1">1. 上傳電子書</h2>
            <p className="text-xs text-stone-500 mb-4">AI 將自動濃縮為約 3,000 字摘要，生成約 20 分鐘有聲書</p>
            <div
              role="button"
              tabIndex={0}
              aria-label="拖放或點擊上傳電子書檔案"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
              }}
              onDrop={handleDrop}
              onClick={() => { setUploadError(null); fileInputRef.current?.click() }}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragging ? 'border-amber-500 bg-amber-100' : 'border-amber-400 hover:border-amber-500 hover:bg-amber-50'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain"
                onChange={handleFileChange}
                className="opacity-0 w-px h-px pointer-events-none absolute"
                onClick={(e) => e.stopPropagation()}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-stone-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); setUploadError(null) }}
                    className="ml-4 text-stone-500 hover:text-red-600 transition-colors"
                    aria-label="移除檔案"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <svg className="w-10 h-10 text-zinc-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" x2="12" y1="3" y2="15"/>
                  </svg>
                  <p className="text-stone-500 mb-1">拖放 EPUB、PDF 或 TXT 至此</p>
                  <p className="text-xs text-zinc-600">或點擊選擇檔案 · 最大 50MB</p>
                </>
              )}
            </div>

            {/* Upload progress bar */}
            {uploading && uploadProgress < 100 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-stone-500 mb-1">
                  <span>正在上傳...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="progress-bar" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {/* Unified error display */}
            {uploadError && (
              <div className="mt-3 p-4 rounded-xl bg-red-950/30 border border-red-800/30">
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <div className="flex-1">
                    <p className="text-red-500 text-sm font-medium">{uploadError.code}</p>
                    <p className="text-red-400 text-sm mt-0.5">{uploadError.message}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setUploadError(null); setFile(null); fileInputRef.current?.click() }}
                  className="btn-secondary text-sm mt-3"
                >
                  重新選擇檔案
                </button>
              </div>
            )}
          </div>

          {/* Voice & Settings */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">2. 語音設定</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">AI 語音</label>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} className="input-field">
                  <optgroup label="ElevenLabs 內建語音">
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </optgroup>
                  {clonedVoices.length > 0 && (
                    <optgroup label="我的克隆語音">
                      {clonedVoices.map((v) => (
                        <option key={v.elevenlabs_voice_id} value={v.elevenlabs_voice_id}>{v.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {plan === 'free' && (
                  <p className="text-xs text-stone-500 mt-1.5">免費方案：僅使用瀏覽器語音預覽</p>
                )}
                {plan !== 'free' && (
                  <button onClick={() => setVoiceLabOpen(o => !o)} className="mt-2 text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                    {voiceLabOpen ? '隱藏' : '建立'} 語音克隆
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">播放速度</label>
                <div className="flex rounded-lg border border-stone-300 overflow-hidden" role="group" aria-label="播放速度">
                  {[0.5, 1, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setRate(speed)}
                      aria-pressed={rate === speed}
                      className={`flex-1 py-2 px-2 text-xs font-medium border-r last:border-r-0 border-stone-300 transition-all ${rate === speed ? 'bg-amber-500 text-white border-amber-500' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-stone-300">
              <label className="block text-sm font-medium text-stone-700 mb-1.5">預覽語音（瀏覽器 TTS）</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="輸入文字試聽..."
                  className="input-field flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePreview() }}
                />
                <button onClick={handlePreview} disabled={previewing || !previewText.trim()} className="btn-secondary whitespace-nowrap">
                  {previewing ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                      播放中
                    </span>
                  ) : '試聽'}
                </button>
              </div>
            </div>
          </div>

          {/* Voice Lab */}
          {voiceLabOpen && plan !== 'free' && (
            <div className="card mb-6 border-amber-300">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Voice Lab — 建立語音克隆</h2>
                <button onClick={() => setVoiceLabOpen(false)} className="text-stone-500 hover:text-stone-700">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <p className="text-sm text-stone-500 mb-4">上傳音訊樣本（30秒~5分鐘）來克隆您的聲音。</p>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">音訊樣本</label>
                  <div
                    onClick={() => audioInputRef.current?.click()}
                    className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${cloneAudio ? 'border-amber-500 bg-amber-950/20' : 'border-stone-300 hover:border-stone-300'}`}
                  >
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/m4a"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCloneAudio(f); setCloneError('') } }}
                      className="opacity-0 w-px h-px pointer-events-none absolute"
                    />
                    {cloneAudio ? (
                      <span className="text-sm text-stone-700">{cloneAudio.name}</span>
                    ) : (
                      <p className="text-sm text-stone-500">點擊上傳 · MP3、WAV、M4A</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">語音名稱</label>
                  <input type="text" value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="例如：我的聲音" maxLength={100} className="input-field w-full" />
                </div>
                <button
                  onClick={async () => {
                    if (!cloneAudio) { setCloneError('請選擇音訊檔案'); return }
                    if (!cloneName.trim()) { setCloneError('請輸入語音名稱'); return }
                    setCloneError(''); setCloneSuccess(''); setCloning(true)
                    const fd = new FormData()
                    fd.append('audio', cloneAudio)
                    fd.append('name', cloneName.trim())
                    try {
                      const res = await fetch('/api/voices/clone', { method: 'POST', body: fd })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || 'Clone failed')
                      setCloneSuccess(`語音「${cloneName}」克隆成功！`)
                      setCloneAudio(null); setCloneName('')
                      const vr = await fetch('/api/voices')
                      const vd = await vr.json()
                      if (Array.isArray(vd)) { setClonedVoices(vd); setVoice(vd[0]?.elevenlabs_voice_id || voice) }
                    } catch (err: unknown) {
                      setCloneError(err instanceof Error ? err.message : 'Clone failed')
                    } finally { setCloning(false) }
                  }}
                  disabled={cloning || !cloneAudio || !cloneName.trim()}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {cloning ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      克隆中...
                    </span>
                  ) : '克隆我的聲音'}
                </button>
                {cloneError && <p className="text-xs text-red-600">{cloneError}</p>}
                {cloneSuccess && <p className="text-xs text-green-600">{cloneSuccess}</p>}
              </div>
              {clonedVoices.length > 0 && (
                <div className="border-t border-stone-300 pt-4">
                  <p className="text-xs font-medium text-stone-500 mb-3">我的克隆語音 ({clonedVoices.length})</p>
                  <div className="space-y-2">
                    {clonedVoices.map((v) => (
                      <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-stone-100">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{v.name}</p>
                          <p className="text-xs text-stone-500">{new Date(v.created_at).toLocaleDateString()}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm(`刪除「${v.name}」？此操作不可復原。`)) return
                            try {
                              await fetch(`/api/voices/${v.id}`, { method: 'DELETE' })
                              setClonedVoices(prev => prev.filter(x => x.id !== v.id))
                              if (voice === v.elevenlabs_voice_id) setVoice('eleven_multilingual_v2')
                            } catch { alert('刪除失敗') }
                          }}
                          className="text-stone-500 hover:text-red-600 ml-2 flex-shrink-0"
                          aria-label={`刪除語音克隆${v.name}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Convert Button */}
          {!conversion && (
            <button
              onClick={handleConvert}
              disabled={!file || converting}
              className="btn-primary w-full justify-center py-3 text-base mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {converting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  處理中...
                </span>
              ) : !file ? (
                '請先選擇檔案'
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                  生成 20 分鐘有聲書
                </span>
              )}
            </button>
          )}

          {/* Pipeline Progress */}
          {(converting || conversion) && (
            <div className="card mb-6">
              <h2 className="font-semibold mb-5">轉換進度</h2>

              {/* 4-step pipeline */}
              <div className="flex items-center justify-between mb-6">
                {PIPELINE_STEPS.map((step, i) => {
                  const isDone = activeStep > i
                  const isActive = activeStep === i
                  return (
                    <div key={i} className="flex items-center flex-1">
                      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                          isDone ? 'bg-amber-500 border-amber-500 text-white' :
                          isActive ? 'bg-amber-100 border-amber-500 text-amber-700 animate-pulse' :
                          'bg-stone-100 border-stone-300 text-stone-400'
                        }`}>
                          {isDone ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : i + 1}
                        </div>
                        <span className={`text-xs text-center leading-tight max-w-[60px] ${isActive ? 'text-amber-700 font-medium' : isDone ? 'text-stone-600' : 'text-stone-400'}`}>
                          {step.label}
                        </span>
                      </div>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-1 mb-5 transition-all ${isDone ? 'bg-amber-500' : 'bg-stone-200'}`} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Progress bar + message */}
              {conversion && conversion.status !== 'completed' && conversion.status !== 'failed' && (
                <>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="relative w-12 h-12 flex-shrink-0">
                      <svg className="w-12 h-12 progress-ring-spin" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="#E7E5E4" strokeWidth="4"/>
                        <circle
                          cx="24" cy="24" r="20" fill="none"
                          stroke="#F59E0B" strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray="125.6"
                          strokeDashoffset={125.6 * (1 - conversion.progress / 100)}
                          className="transition-all duration-500 ease-out"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-stone-700">
                        {conversion.progress}%
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="progress-bar" role="progressbar" aria-valuenow={conversion.progress} aria-valuemin={0} aria-valuemax={100}>
                        <div className="progress-bar-fill" style={{ width: `${conversion.progress}%` }} />
                      </div>
                      <p className="text-sm text-stone-600 mt-2">{conversion.message}</p>
                    </div>
                  </div>
                </>
              )}

              {/* Failed state */}
              {conversion?.status === 'failed' && (
                <div>
                  <p className="text-sm text-red-600 mb-3">{conversion.message || '轉換失敗，請重試。'}</p>
                  <button onClick={() => { setConversion(null); setConverting(false) }} className="btn-secondary text-sm">重新嘗試</button>
                </div>
              )}

              {/* Completed state */}
              {conversion?.status === 'completed' && (
                <div className="space-y-5">
                  <div className="flex gap-4">
                    {conversion.title && (
                      <div className="flex-1 p-3 rounded-lg bg-stone-100">
                        <p className="text-xs text-stone-500">書名</p>
                        <p className="font-medium text-sm truncate">{conversion.title}</p>
                      </div>
                    )}
                    {conversion.summary_word_count && (
                      <div className="flex-1 p-3 rounded-lg bg-stone-100">
                        <p className="text-xs text-stone-500">摘要字數</p>
                        <p className="font-medium text-sm">{conversion.summary_word_count.toLocaleString()} 字</p>
                      </div>
                    )}
                    <div className="flex-1 p-3 rounded-lg bg-stone-100">
                      <p className="text-xs text-stone-500">預估時長</p>
                      <p className="font-medium text-sm">約 20 分鐘</p>
                    </div>
                  </div>

                  {/* Audio player (Pro/Business) */}
                  {conversion.audio_url && (
                    <div>
                      <p className="text-sm font-medium mb-3">完整有聲書</p>
                      <audio controls className="w-full h-10 rounded-lg" src={conversion.audio_url}>
                        您的瀏覽器不支援音訊播放。
                      </audio>
                      <div className="flex gap-3 mt-3">
                        <a href={conversion.audio_url} download className="btn-primary text-sm">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" x2="12" y1="15" y2="3"/>
                          </svg>
                          下載 MP3
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Free tier: browser TTS playback of summary */}
                  {!conversion.audio_url && conversion.summary && (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-amber-800 font-medium text-sm mb-2">免費方案 — 瀏覽器語音預覽</p>
                      <p className="text-amber-700 text-xs mb-3 leading-relaxed line-clamp-4">{conversion.summary.slice(0, 200)}...</p>
                      <button
                        onClick={handlePlaySummary}
                        disabled={previewing}
                        className="btn-secondary text-sm"
                      >
                        {previewing ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                            朗讀中（約 20 分鐘）
                          </span>
                        ) : '用瀏覽器朗讀摘要（約 20 分鐘）'}
                      </button>
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <p className="text-xs text-amber-600">
                          升級 Pro 方案可下載高品質 MP3：
                          <Link href="/pricing" className="ml-1 underline">查看方案 →</Link>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* No audio, no summary */}
                  {!conversion.audio_url && !conversion.summary && (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-amber-700 text-sm">
                        {plan !== 'free' ? (
                          <>請在 <Link href="/settings" className="underline">設定頁</Link> 新增 ElevenLabs API 金鑰以啟用音訊生成。</>
                        ) : (
                          <>免費方案不生成音訊，請 <Link href="/pricing" className="underline">升級方案</Link> 以下載 MP3。</>
                        )}
                      </p>
                    </div>
                  )}

                  <button onClick={() => { setConversion(null); setConverting(false); setFile(null) }} className="btn-secondary text-sm w-full justify-center">
                    轉換另一本書
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
