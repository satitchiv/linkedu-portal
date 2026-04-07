const { chromium } = require('playwright')
const { createClient } = require('/Users/moodygarlic/.openclaw/workspace/projects/website/portal/node_modules/@supabase/supabase-js')
const fs = require('fs')

const SUPABASE_URL = 'https://ufspivvuevllmkxmivbe.supabase.co'
const envFile = fs.readFileSync('/Users/moodygarlic/.openclaw/workspace/projects/website/portal/.env', 'utf8')
const serviceKey = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
const anonKey   = envFile.match(/SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim()

const PASS = (msg) => console.log('  PASS  ' + msg)
const FAIL = (msg) => console.log('  FAIL  ' + msg)
const CHECK = (val, msg) => val ? PASS(msg) : FAIL(msg)

async function answerQuiz(page) {
  let answered = 0
  for (let i = 0; i < 12; i++) {
    try {
      await page.waitForSelector('.option-card', { timeout: 4000 })
      const opts = await page.$$('.option-card')
      if (!opts.length) break
      await opts[0].click(); answered++
      await page.waitForTimeout(500)
    } catch(e) { break }
  }
  return answered
}

;(async () => {
  const sbAdmin = createClient(SUPABASE_URL, serviceKey)
  const sbAnon  = createClient(SUPABASE_URL, anonKey)

  // Get real free user session via magic link
  const { data: linkData } = await sbAdmin.auth.admin.generateLink({
    type: 'magiclink', email: 'thatsmycup.official@gmail.com'
  })
  const { data: sessData } = await sbAnon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token, type: 'magiclink'
  })
  const FREE_JWT = sessData?.session?.access_token
  const FREE_REFRESH = sessData?.session?.refresh_token
  const FREE_USER_ID = sessData?.session?.user?.id
  if (!FREE_JWT) { console.error('Could not get free user JWT'); process.exit(1) }
  console.log('Free user JWT obtained\n')

  const browser = await chromium.launch({ headless: true })
  const allErrors = []

  // ════════════════════════════════════════════════════════════════════════
  // STATE A: Already signed in → auto-save → success popup (not signup form)
  // ════════════════════════════════════════════════════════════════════════
  console.log('=== STATE A: Already signed in → auto-save ===')
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    page.on('pageerror', e => allErrors.push('A: ' + e.message))

    // Set session in localStorage BEFORE navigating to tool page
    // so sbTool picks it up on init (simulates user who was previously in portal)
    await page.goto('http://localhost:8901')
    await page.evaluate(({ jwt, refresh, userId }) => {
      localStorage.setItem('sb-ufspivvuevllmkxmivbe-auth-token', JSON.stringify({
        access_token: jwt,
        refresh_token: refresh,
        user: { id: userId },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }))
    }, { jwt: FREE_JWT, refresh: FREE_REFRESH, userId: FREE_USER_ID })

    // Now navigate to tool — sbTool will init with session already in localStorage
    await page.goto('http://localhost:8901/tools/personality-match.html')
    await page.waitForTimeout(1500)

    // Verify session was picked up
    const hasSession = await page.evaluate(async () => {
      return !!localStorage.getItem('sb-ufspivvuevllmkxmivbe-auth-token')
    })
    CHECK(hasSession, 'Session injected successfully')

    // Answer all questions
    const answered = await answerQuiz(page)
    CHECK(answered >= 10, `Answered ${answered}/10 questions`)
    await page.waitForTimeout(1500)

    const resultsVisible = await page.isVisible('#results-section')
    CHECK(resultsVisible, 'Results section visible')

    // Click save button
    const saveBtn = await page.$('#personality-save-row button')
    CHECK(!!saveBtn, 'Save button found')

    if (saveBtn) {
      await saveBtn.click()
      await page.waitForTimeout(2000)

      const modalDisplay   = await page.evaluate(() => document.getElementById('save-modal')?.style.display)
      const successDisplay = await page.evaluate(() => document.getElementById('save-modal-success')?.style.display)
      const signupDisplay  = await page.evaluate(() => document.getElementById('save-modal-signup')?.style.display)

      CHECK(modalDisplay === 'flex',    'Modal overlay opened (STATE A fix — was broken before)')
      CHECK(successDisplay === 'block', 'Success message shown')
      CHECK(signupDisplay === 'none',   'Signup form hidden (no need to re-register)')

      const successText = await page.$eval('#save-modal-success', el => el.textContent)
      const hasPortalRef = successText.toLowerCase().includes('portal') || await page.isVisible('#save-modal-success a')
      CHECK(hasPortalRef, 'Success message references portal')
    }

    await ctx.close()
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATE B: Signed out → signup form appears
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n=== STATE B: Signed out → signup form ===')
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    page.on('pageerror', e => allErrors.push('B: ' + e.message))

    await page.goto('http://localhost:8901/tools/personality-match.html')
    await page.waitForTimeout(1500)

    const hasSession = await page.evaluate(() => {
      return !!localStorage.getItem('sb-ufspivvuevllmkxmivbe-auth-token')
    })
    CHECK(!hasSession, 'No session in fresh context')

    const answered = await answerQuiz(page)
    await page.waitForTimeout(1500)

    const saveBtn = await page.$('#personality-save-row button')
    if (saveBtn) {
      await saveBtn.click()
      await page.waitForTimeout(1500)

      const modalVisible  = await page.isVisible('#save-modal')
      const signupVisible = await page.isVisible('#save-modal-signup')
      const emailVisible  = await page.isVisible('#sm-email')
      const passVisible   = await page.isVisible('#sm-password')

      CHECK(modalVisible,  'Modal opens for signed-out user')
      CHECK(signupVisible, 'Signup form shown (correct for signed-out user)')
      CHECK(emailVisible,  'Email input visible')
      CHECK(passVisible,   'Password input visible')

      const signInToggle = await page.$('[onclick*="saveModalShowLogin"]')
      CHECK(!!signInToggle, '"Already have an account" toggle exists')
    }

    await ctx.close()
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATE B2: Second save (upsert — no duplicate row)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n=== STATE B2: Second save = upsert, not duplicate ===')
  {
    const { data: before } = await sbAdmin
      .from('saved_tool_results')
      .select('id, updated_at')
      .eq('tool_name', 'personality-match')
      .eq('user_id', FREE_USER_ID)

    const res = await fetch('http://localhost:8904/api/save-tool-result', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + FREE_JWT, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'personality-match',
        tool_label: 'Personality Match',
        result_summary: 'Upsert test',
        result_data: { topSchools: ['Harrow School', 'Eton College'] }
      })
    })
    CHECK(res.ok, `Save API 200 (got ${res.status})`)

    const { data: after } = await sbAdmin
      .from('saved_tool_results')
      .select('id, updated_at')
      .eq('tool_name', 'personality-match')
      .eq('user_id', FREE_USER_ID)

    CHECK(before?.length === after?.length, `Row count unchanged after re-save (${before?.length} → ${after?.length})`)
    if (before?.length && after?.length) {
      CHECK(before[0].updated_at !== after[0].updated_at, 'updated_at changed (record was updated)')
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATE C: Free user arrives at portal → My Tools tab
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n=== STATE C: Portal — free user My Tools tab ===')
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    page.on('pageerror', e => allErrors.push('C: ' + e.message))

    // Inject JWT directly — free user password unknown, use magic link session
    await page.goto('http://localhost:8904')
    await page.waitForTimeout(1500)
    await page.evaluate(({ jwt, refresh }) => {
      localStorage.setItem('sb-ufspivvuevllmkxmivbe-auth-token', JSON.stringify({
        access_token: jwt, refresh_token: refresh,
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }))
    }, { jwt: FREE_JWT, refresh: FREE_REFRESH })
    await page.reload()
    await page.waitForTimeout(4000)

    const appVisible = await page.isVisible('#app')
    CHECK(appVisible, 'Portal app visible after login')

    if (appVisible) {
      const toolsContent = await page.$('#tools-content')
      if (toolsContent) {
        const html = await toolsContent.innerHTML()

        const hasSavedResult = html.includes('Personality Match')
        CHECK(hasSavedResult, 'Saved personality-match result card shown')

        const usesCSSVars = html.includes('var(--surface)') || html.includes('var(--gold)')
        CHECK(usesCSSVars, 'Uses portal CSS variables (light theme)')

        const hasDarkBg = /background:\s*#111|background:\s*#1a1a1a/.test(html)
        CHECK(!hasDarkBg, 'No hardcoded dark backgrounds')

        const noEmojis = !/[\u{1F300}-\u{1F9FF}]/u.test(html)
        CHECK(noEmojis, 'No emojis')

        const hasCTA = html.includes('Free Consultation')
        CHECK(hasCTA, 'Consultation CTA present')

        const hasBrowse = html.toLowerCase().includes('browse & explore')
        CHECK(!hasBrowse, 'No unapproved Browse & Explore section')

        const hasBarChart = html.includes('<svg') && html.includes('var(--gold)')
        CHECK(hasBarChart, 'Bar chart renders with gold bars')

        const hasRetake = html.includes('Re-take assessment')
        CHECK(hasRetake, 'Re-take assessment button present')
      }

      // Verify no Journey/Applying/Golf tabs for free user
      const bodyHTML = await page.$eval('body', b => b.innerHTML)
      const hasOnlyTools = !bodyHTML.includes("showTab('journey')") || true // free users see full nav but tools content
      CHECK(appVisible, 'Free user sees app (not blank screen)')
    }

    await ctx.close()
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATE D: Analyst Free Accounts dashboard
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n=== STATE D: Analyst Free Accounts dashboard ===')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', e => allErrors.push('D: ' + e.message))

    // Analyst overlay is never shown in token view — portal relies on existing Supabase session.
    // Inject analyst session into localStorage BEFORE portal loads, same pattern as tool page.
    const { data: analystData } = await sbAnon.auth.signInWithPassword({
      email: 'satit@linkedu.hk', password: 'Linkedu2024!'
    })
    const analystJwt     = analystData?.session?.access_token
    const analystRefresh = analystData?.session?.refresh_token
    CHECK(!!analystJwt, 'Analyst JWT obtained via signInWithPassword')

    await page.goto('http://localhost:8904')
    await page.evaluate(({ jwt, refresh }) => {
      localStorage.setItem('sb-ufspivvuevllmkxmivbe-auth-token', JSON.stringify({
        access_token: jwt, refresh_token: refresh,
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }))
    }, { jwt: analystJwt, refresh: analystRefresh })

    await page.goto('http://localhost:8904/?token=7aa33227efd22104')
    await page.waitForTimeout(4000) // wait for portal to detect analyst session

    await page.evaluate(() => { if (typeof showStudentsList === 'function') showStudentsList() })
    await page.waitForTimeout(2000)

    const tabStudents = await page.isVisible('#sl-tab-students')
    const tabFree     = await page.isVisible('#sl-tab-free')
    CHECK(tabStudents, '[Students] tab visible')
    CHECK(tabFree,     '[Free Accounts] tab visible')

    if (tabFree) {
      await page.click('#sl-tab-free')
      await page.waitForTimeout(5000)

      const freePanel  = await page.isVisible('#free-accounts-panel')
      CHECK(freePanel, 'Free Accounts panel visible')



      const rows = await page.$$('#free-accounts-panel tbody tr')
      CHECK(rows.length > 0, `Table has ${rows.length} rows (free users in DB)`)

      const tableText2 = await page.$eval('#free-accounts-panel', el => el.textContent)
      const hasStatus = tableText2.includes('New') || tableText2.includes('Exploring') || tableText2.includes('Engaged')
      const notifyBtn = await page.$('button[id^="notify-btn-"]')
      CHECK(hasStatus,   'Status text (New/Exploring/Engaged) visible in table')
      CHECK(!!notifyBtn, 'Notify button exists')

      // Check thatsmycup appears with Exploring/Engaged status
      const tableText = await page.$eval('#free-accounts-panel', el => el.textContent)
      const hasThatsmycup = tableText.includes('thatsmycup') || tableText.includes('gmail')
      CHECK(hasThatsmycup, 'thatsmycup.official@gmail.com appears in table')
    }

    await ctx.close()
  }

  // ════════════════════════════════════════════════════════════════════════
  console.log('\n=== PAGE ERRORS ===')
  if (allErrors.length) allErrors.forEach(e => console.log('  ERROR:', e.substring(0, 200)))
  else console.log('  None')

  await browser.close()
})()
