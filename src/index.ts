export { record } from './recorder.js'
export { login } from './login.js'
export { loadDefinition, loadSetup } from './validation.js'
export { resolveAuth } from './providers/index.js'
export { setLogLevel, getLogLevel } from './logger.js'
export type { LogLevel } from './logger.js'
export {
  createCursorTracker,
  moveCursorToPoint,
  hideCursor,
  showCursor,
} from './cursor.js'
export type {
  RecordingDefinition,
  RecordOptions,
  RecordingResult,
  SetupBlock,
  Step,
  ActionName,
  Viewport,
  Cookie,
  AuthProvider,
  SupabaseAuthProvider,
  AuthResult,
  WaitStep,
  ClickStep,
  TypeStep,
  ClearStep,
  FillStep,
  SelectStep,
  ScrollStep,
  HoverStep,
  KeyboardStep,
  NavigateStep,
  ScreenshotStep,
  ZoomStep,
  WaitForNetworkStep,
  CursorOptions,
  CursorStyle,
  WindowChromeOptions,
  BackgroundOptions,
  OutputFormat,
  StepTiming,
  CursorTracker,
} from './types.js'
export type { LoginOptions } from './login.js'
export { recordPage } from './record-page.js'
export type {
  PageRecorder,
  RecordPageOptions,
  SelectorOrLocator,
} from './record-page.js'
