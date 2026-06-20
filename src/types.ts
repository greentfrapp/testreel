export interface Viewport {
  width: number
  height: number
}

export interface Cookie {
  name: string
  value: string
  domain: string
  path: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export type OutputFormat = 'webm' | 'mp4' | 'gif'

export interface StepTiming {
  stepIndex: number
  startTime: number // seconds from recording start
  endTime: number // seconds from recording start
  speed: number
}

// --- Step types (discriminated union on `action`) ---

interface BaseStep {
  pauseAfter?: number
  speed?: number
  /** Timeout in ms for selector resolution. Default: 5000. */
  timeout?: number
  /** Selector or 'networkidle' condition to wait for before the action executes. */
  waitFor?: string
  /** Voiceover narrated while this step is on screen. A string is shorthand for
   *  `{ text }`. The step's on-screen slot is extended (the live page idles) until
   *  the narration finishes; narration always plays at 1x even if the step's
   *  visuals are sped up via `speed`. */
  narrate?: string | NarrationSpec
}

export interface WaitStep extends BaseStep {
  action: 'wait'
  ms?: number
}

export interface ClickStep extends BaseStep {
  action: 'click'
  selector: string
  /** Zoom into the click target at this scale, then zoom back out after the click.
   *  Example: `zoom: 2` zooms to 2x, clicks, waits pauseAfter, then zooms out. */
  zoom?: number
}

export interface TypeStep extends BaseStep {
  action: 'type'
  selector: string
  text: string
  delay?: number
  clear?: boolean
}

export interface ClearStep extends BaseStep {
  action: 'clear'
  selector: string
}

export interface FillStep extends BaseStep {
  action: 'fill'
  selector: string
  text: string
}

export interface SelectStep extends BaseStep {
  action: 'select'
  selector: string
  value: string
}

export interface ScrollStep extends BaseStep {
  action: 'scroll'
  x?: number
  y?: number
  /** Scroll animation speed multiplier (separate from BaseStep.speed which controls video playback speed). */
  scrollSpeed?: number
}

export interface HoverStep extends BaseStep {
  action: 'hover'
  selector: string
}

export interface KeyboardStep extends BaseStep {
  action: 'keyboard'
  key: string
}

export interface NavigateStep extends BaseStep {
  action: 'navigate'
  url: string
}

export interface ScreenshotStep extends BaseStep {
  action: 'screenshot'
  name?: string
  fullPage?: boolean
}

export interface ZoomStep extends BaseStep {
  action: 'zoom'
  selector?: string
  scale?: number
  x?: number
  y?: number
  duration?: number
}

export interface WaitForNetworkStep extends BaseStep {
  action: 'waitForNetwork'
  /** URL substring to match against completed responses. */
  urlPattern: string
}

export interface HideCursorStep extends BaseStep {
  action: 'hideCursor'
}

export interface ShowCursorStep extends BaseStep {
  action: 'showCursor'
}

export type Step =
  | WaitStep
  | ClickStep
  | TypeStep
  | ClearStep
  | FillStep
  | SelectStep
  | ScrollStep
  | HoverStep
  | KeyboardStep
  | NavigateStep
  | ScreenshotStep
  | ZoomStep
  | WaitForNetworkStep
  | HideCursorStep
  | ShowCursorStep

export type ActionName = Step['action']

export interface SetupBlock {
  url?: string
  steps: Step[]
}

// --- Narration / TTS ---

export type TTSFormat = 'opus' | 'mp3' | 'wav'

/** Narration text plus optional per-clip voice/model overrides. */
export interface NarrationSpec {
  text: string
  voice?: string
  model?: string
}

/** A standalone narration cue not bound to a step. */
export interface NarrationCue extends NarrationSpec {
  /** 'start' plays before the first step; 'end' plays after the last step. */
  at: 'start' | 'end'
}

export interface NarrationConfig {
  /** TTS provider. Only 'openai' is supported in v1. Default: 'openai'. */
  provider?: 'openai'
  /** Default voice for all clips. Default: provider-specific ('alloy' for OpenAI). */
  voice?: string
  /** Default model for all clips. Default: provider-specific. */
  model?: string
  /** Audio container/codec for synthesized clips. Default: 'opus'. */
  format?: TTSFormat
  /** API key. Falls back to the provider's standard env var (OPENAI_API_KEY). */
  apiKey?: string
  /** Standalone intro/outro cues. */
  cues?: NarrationCue[]
}

export type CursorStyle = 'default' | 'pointer' | 'text' | 'touch'

export interface CursorOptions {
  enabled?: boolean
  /** Cursor image style. Default: 'default'. */
  style?: CursorStyle
  size?: number
  color?: string
  rippleColor?: string
  rippleSize?: number
  transitionMs?: number
  /** Automatically fade out the cursor after a period of inactivity. Default: true.
   *  Disabled when the recording contains explicit hideCursor/showCursor steps. */
  idleHide?: boolean
  /** Idle threshold in ms before auto-hiding the cursor. Default: 3000. */
  idleHideMs?: number
  /** Fade in/out duration in ms used by hide/show transitions. Default: 400. */
  fadeMs?: number
}

export interface WindowChromeOptions {
  enabled?: boolean
  /** Title bar height in pixels. Default: 38. */
  titleBarHeight?: number
  /** Title bar color as hex string. Default: '#e8e8e8'. */
  titleBarColor?: string
  /** Show traffic light buttons. Default: true. */
  trafficLights?: boolean
  /** Display a URL in the title bar. Set to true to use the recording URL, or pass a custom string. */
  url?: boolean | string
}

export interface BackgroundOptions {
  enabled?: boolean
  /** Solid background color as hex string. If neither color nor gradient is set, defaults to a gradient from '#6366f1' to '#a855f7'. */
  color?: string
  /** Two-color diagonal gradient. If neither color nor gradient is set, defaults to { from: '#6366f1', to: '#a855f7' }. */
  gradient?: { from: string; to: string }
  /** Padding around the window in pixels. Default: 60. */
  padding?: number
  /** Corner radius in pixels. Default: 12. */
  borderRadius?: number
}

export interface RecordingDefinition {
  url: string
  viewport?: Viewport
  /** Desired final video dimensions. When set, the browser viewport is computed
   *  by subtracting chrome title bar height and background padding so the output
   *  video matches this size exactly. Takes precedence over `viewport`. */
  outputSize?: Viewport
  colorScheme?: 'light' | 'dark'
  waitForSelector?: string
  storageState?: string
  cookies?: Cookie[]
  localStorage?: Record<string, string>
  headers?: Record<string, string>
  auth?: AuthProvider
  cursor?: boolean | CursorOptions
  /** macOS-style window chrome (title bar with traffic light buttons). */
  chrome?: boolean | WindowChromeOptions
  /** Background, padding, and rounded corners around the recording. */
  background?: boolean | BackgroundOptions
  speed?: number
  outputFormat?: OutputFormat
  setup?: SetupBlock
  /** Voiceover configuration: provider defaults and standalone intro/outro cues.
   *  Per-step narration is set via each step's `narrate` field. */
  narration?: NarrationConfig
  steps: Step[]
}

export interface RecordOptions {
  outputDir?: string
  headless?: boolean
  setup?: SetupBlock
  speed?: number
  outputFormat?: OutputFormat
  /** Remove previous testreel output files from outputDir before recording. Default: false. */
  clean?: boolean
  /** Keep intermediate files (cursor JSON, etc.) instead of cleaning up. */
  keepIntermediates?: boolean
}

export interface RecordingResult {
  video?: string
  screenshots: string[]
  cursorEvents?: string
  /** Path to the output.json manifest file. */
  manifest?: string
}

// --- Auth providers (discriminated union on `provider`) ---

export interface SupabaseAuthProvider {
  provider: 'supabase'
  url: string
  serviceRoleKey: string
  email: string
}

export type AuthProvider = SupabaseAuthProvider

export interface AuthResult {
  localStorage?: Record<string, string>
  cookies?: Cookie[]
  headers?: Record<string, string>
}

export interface ZoomState {
  scale: number
  tx: number
  ty: number
}

export interface CursorEvent {
  time: number // seconds from recording start
  type: 'move' | 'ripple' | 'hide' | 'show' | 'zoom'
  x: number
  y: number
  transitionMs?: number // for 'move' events
  rippleSize?: number // for 'ripple' events
  rippleColor?: string // for 'ripple' events
  cursorStyle?: CursorStyle // for 'move' events — auto-detected from target element
  /** Move events emitted by non-interactive actions (type/fill/clear/select)
   *  that should not count as cursor activity for idle auto-hide purposes. */
  silent?: boolean // for 'move' events
  zoomScale?: number // for 'zoom' events — page zoom level
  zoomDurationMs?: number // for 'zoom' events — transition duration
  zoomTx?: number // for 'zoom' events — clamped X translation
  zoomTy?: number // for 'zoom' events — clamped Y translation
}

export interface CursorTracker {
  computeTransitionMs(
    targetX: number,
    targetY: number,
    explicitMs?: number,
  ): number
  moveCursorTo(
    page: import('playwright-core').Page,
    selector: string | import('playwright-core').Locator,
    zoomState: ZoomState,
    options?: CursorOptions,
    silent?: boolean,
  ): Promise<void>
  moveCursorToPoint(
    page: import('playwright-core').Page,
    x: number,
    y: number,
    options?: CursorOptions,
    silent?: boolean,
  ): Promise<void>
  triggerRipple(
    page: import('playwright-core').Page,
    options?: CursorOptions,
  ): Promise<void>
  hideCursor(page: import('playwright-core').Page): Promise<void>
  showCursor(page: import('playwright-core').Page): Promise<void>
  setZoom(scale: number, durationMs: number, tx?: number, ty?: number): void
  getEvents(): CursorEvent[]
}

export interface ActionContext {
  outputDir: string
  zoomState: ZoomState
  cursorEnabled: boolean
  cursorOptions?: CursorOptions
  cursorTracker?: CursorTracker
  useFFmpegZoom?: boolean
}
