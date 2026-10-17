import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initAppState } from '../../src/main/state/app-state'

// App state (profile, runs, chats) lives in userData in the app; each test file gets its own.
initAppState(mkdtempSync(join(tmpdir(), 'phq-userdata-')))
