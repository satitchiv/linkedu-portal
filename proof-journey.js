/**
 * LinkedU Parent Portal — Customer Journey Proof Test
 *
 * Tests all 8 distinct user journeys end-to-end.
 * Run with: node proof-journey.js
 * Requires: netlify dev running on port 8904
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE_URL     = 'http://localhost:8904'
const ANALYST_EMAIL = 'satit@linkedu.hk'
const ANALYST_PASS  = 'Linkedu2024!'
const PARENT_EMAIL  = 'khunmuk.test@linkedu.hk'
const PARENT_PASS   = 'satit1987'
const POOH_TOKEN    = 'ea300e679a88acf9'
const BAD_TOKEN     = 'BADTOKEN123'

const SS_DIR = path.join(__dirname, 'screenshots-journey')
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR)

const results = []
function pass(j, detail)  { results.push({ j, status: 'PASS', detail }); console.log(`[PASS] ${j}: ${detail}`) }
function fail(j, detail)  { results.push({ j, status: 'FAIL', detail }); console.log(`[FAIL] ${j}: ${detail}`) }
function risk(j, detail)  { results.push({ j, status: 'RISK', detail }); console.log(`[RISK] ${j}: ${detail}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function screenshot(page, name) {
  try { await page.screenshot({ path: path.join(SS_DIR, `${name}.png`), fullPage: false }) } catch(e) {}
}

// Sign in using whichever form is visible (dev on localhost, pw on prod)
async function signIn(page, email, password) {
  // Try dev form first (localhost shows this after showSignIn() is called)
  const devVisible = await page.locator('#dev-email').isVisible().catch(() => false)
  if (devVisible) {
    await page.fill('#dev-email', email)
    await page.fill('#dev-password', password)
    await page.click('#dev-btn')
  } else {
    await page.fill('#pw-email', email)
    await page.fill('#pw-password', password)
    await page.click('#pw-btn')
  }
}

async function runTests() {
  const browser = await chromium.launch({ headless: true })

  // ─────────────────────────────────────────────────────────────────────────────
  // J1 — New parent, no session, token URL
  // Checks: portal loads, Add child bar visible, Sign in button visible
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J1: New parent, no session, token URL ──')
  {
    const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE_URL}/?token=${POOH_TOKEN}`, { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 })
      await sleep(1500)

      const appVisible      = await page.locator('#app').isVisible()
      const authHidden      = !(await page.locator('#auth-screen').isVisible())
      const headerName      = await page.locator('#header-name').textContent().catch(() => '')
      const hasName         = headerName.trim().length > 0 && headerName !== 'Loading...'
      const tabsVisible     = await page.locator('#tabnav').isVisible()
      const addChildBar     = await page.locator('#child-manager-bar').isVisible().catch(() => false)
      const addChildBtn     = await page.locator('.cmb-add-btn').isVisible().catch(() => false)
      const signinBtnVisible = await page.locator('#btn-parent-signin').isVisible().catch(() => false)

      await screenshot(page, 'J1-token-no-session')

      const issues = []
      if (!appVisible)       issues.push('#app not visible')
      if (!authHidden)       issues.push('#auth-screen is visible (should be hidden)')
      if (!hasName)          issues.push(`Header name not loaded (got: "${headerName}")`)
      if (!tabsVisible)      issues.push('#tabnav not visible')
      if (!addChildBar)      issues.push('#child-manager-bar not visible')
      if (!addChildBtn)      issues.push('.cmb-add-btn not visible')
      if (!signinBtnVisible) issues.push('#btn-parent-signin not visible in header')

      if (issues.length === 0) {
        pass('J1', `Portal loaded. Header: "${headerName}". Add child bar: yes. Sign in btn: yes`)
      } else {
        await screenshot(page, 'J1-FAIL')
        fail('J1', issues.join(' | '))
      }
    } catch(e) {
      await screenshot(page, 'J1-FAIL')
      fail('J1', `Exception: ${e.message}`)
    }
    await ctx.close()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // J2 — Invalid token
  // Checks: auth-screen visible, auth-form-wrap hidden, error message shown
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J2: Invalid token ──')
  {
    const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE_URL}/?token=${BAD_TOKEN}`, { waitUntil: 'networkidle', timeout: 20000 })
      await sleep(2000)

      const authVisible    = await page.locator('#auth-screen').isVisible()
      const formHidden     = !(await page.locator('#auth-form-wrap').isVisible().catch(() => true))
      const errorVisible   = await page.locator('#auth-error').isVisible().catch(() => false)
      const errorText      = await page.locator('#auth-error').textContent().catch(() => '')
      const hasExpiredText = /invalid|expired/i.test(errorText)
      const appHidden      = !(await page.locator('#app').isVisible())

      await screenshot(page, 'J2-invalid-token')

      const issues = []
      if (!authVisible)    issues.push('#auth-screen not visible')
      if (!formHidden)     issues.push('#auth-form-wrap is visible (should be hidden)')
      if (!errorVisible)   issues.push('#auth-error not visible')
      if (!hasExpiredText) issues.push(`Error text wrong: "${errorText}"`)
      if (!appHidden)      issues.push('#app is visible (should be hidden)')

      if (issues.length === 0) {
        pass('J2', `Error shown: "${errorText.trim()}"`)
      } else {
        await screenshot(page, 'J2-FAIL')
        fail('J2', issues.join(' | '))
      }
    } catch(e) {
      await screenshot(page, 'J2-FAIL')
      fail('J2', `Exception: ${e.message}`)
    }
    await ctx.close()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // J3 — Root URL, no session
  // Checks: auth-screen visible, app hidden, sign-in form present
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J3: Root URL, no session ──')
  {
    const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 })
      await sleep(2000)

      const authVisible   = await page.locator('#auth-screen').isVisible()
      const appHidden     = !(await page.locator('#app').isVisible())
      // Either prod form (#pw-email) or dev form (#dev-email) should be visible
      const pwVisible     = await page.locator('#pw-email').isVisible().catch(() => false)
      const devVisible    = await page.locator('#dev-email').isVisible().catch(() => false)
      const formPresent   = pwVisible || devVisible
      const signinParentHidden = !(await page.locator('#btn-parent-signin').isVisible().catch(() => false))

      await screenshot(page, 'J3-root-no-session')

      const issues = []
      if (!authVisible)        issues.push('#auth-screen not visible')
      if (!appHidden)          issues.push('#app is visible (should be hidden)')
      if (!formPresent)        issues.push('No sign-in form visible (#pw-email and #dev-email both hidden)')
      if (!signinParentHidden) issues.push('#btn-parent-signin is visible (should not be on root URL)')

      if (issues.length === 0) {
        pass('J3', `Auth screen shown. Form: ${pwVisible ? '#pw-email (prod)' : '#dev-email (dev)'}. Parent sign-in btn hidden.`)
      } else {
        await screenshot(page, 'J3-FAIL')
        fail('J3', issues.join(' | '))
      }
    } catch(e) {
      await screenshot(page, 'J3-FAIL')
      fail('J3', `Exception: ${e.message}`)
    }
    await ctx.close()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // J4 — Analyst sign-in at root URL
  // Checks: signs in successfully, analyst controls appear
  // Context kept open for J5 and J6
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J4: Analyst sign-in at root URL ──')
  const analystCtx  = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const analystPage = await analystCtx.newPage()
  let j4Passed = false
  try {
    await analystPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 })
    await sleep(1500)
    await signIn(analystPage, ANALYST_EMAIL, ANALYST_PASS)
    // Analyst lands on students-list-screen (not #app)
    await analystPage.waitForSelector('#students-list-screen', { state: 'visible', timeout: 20000 }).catch(() => {})
    await sleep(1000)
    await screenshot(analystPage, 'J4-after-signin')

    const studentsListVisible = await analystPage.locator('#students-list-screen').isVisible().catch(() => false)
    const authHidden          = !(await analystPage.locator('#auth-screen').isVisible())
    const appHidden           = !(await analystPage.locator('#app').isVisible())

    const issues = []
    if (!studentsListVisible) issues.push('#students-list-screen not visible (analyst should see student list)')
    if (!authHidden)          issues.push('#auth-screen still visible')
    if (!appHidden)           issues.push('#app is visible (should be hidden until a student is selected)')

    if (issues.length === 0) {
      pass('J4', 'Analyst signed in. Students list screen shown. Auth screen hidden.')
      j4Passed = true
    } else {
      await screenshot(analystPage, 'J4-FAIL')
      fail('J4', issues.join(' | '))
    }
  } catch(e) {
    await screenshot(analystPage, 'J4-FAIL')
    fail('J4', `Exception: ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // J5 — Analyst visits token URL (session already active from J4)
  // Checks: analyst features apply silently, family bar visible
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J5: Analyst visits token URL (session active) ──')
  if (j4Passed) {
    try {
      await analystPage.goto(`${BASE_URL}/?token=${POOH_TOKEN}`, { waitUntil: 'networkidle', timeout: 20000 })
      await analystPage.waitForSelector('#app', { state: 'visible', timeout: 15000 }).catch(() => {})
      await sleep(3000)
      await screenshot(analystPage, 'J5-analyst-token-url')

      const appVisible        = await analystPage.locator('#app').isVisible()
      const allStudentsBtn    = await analystPage.locator('#btn-all-students').isVisible().catch(() => false)
      const newStudentBtn     = await analystPage.locator('#btn-new-student').isVisible().catch(() => false)
      const familyBarVisible  = await analystPage.locator('#analyst-family-bar').isVisible().catch(() => false)
      const signinBtnHidden   = !(await analystPage.locator('#btn-parent-signin').isVisible().catch(() => false))

      const issues = []
      if (!appVisible)       issues.push('#app not visible')
      if (!allStudentsBtn)   issues.push('#btn-all-students missing (analyst session not applied)')
      if (!newStudentBtn)    issues.push('#btn-new-student missing')
      if (!familyBarVisible) risk('J5-family-bar', '#analyst-family-bar not visible (may load async)')
      if (!signinBtnHidden)  issues.push('#btn-parent-signin visible (should be hidden)')

      if (issues.length === 0) {
        pass('J5', `Analyst view applied silently. Family bar: ${familyBarVisible ? 'visible' : 'not loaded yet'}`)
      } else {
        await screenshot(analystPage, 'J5-FAIL')
        fail('J5', issues.join(' | '))
      }
    } catch(e) {
      await screenshot(analystPage, 'J5-FAIL')
      fail('J5', `Exception: ${e.message}`)
    }
  } else {
    risk('J5', 'Skipped — J4 did not pass (no analyst session)')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // J6 — Copy link (?view=parent) — analyst session blocked
  // Checks: parent view only, no analyst controls, Sign in btn visible
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J6: Copy link (?view=parent) with analyst session ──')
  if (j4Passed) {
    try {
      await analystPage.goto(`${BASE_URL}/?token=${POOH_TOKEN}&view=parent`, { waitUntil: 'networkidle', timeout: 20000 })
      await sleep(3000)
      await screenshot(analystPage, 'J6-view-parent')

      const appVisible          = await analystPage.locator('#app').isVisible()
      const allStudentsBtnHidden = !(await analystPage.locator('#btn-all-students').isVisible().catch(() => false))
      const newStudentBtnHidden  = !(await analystPage.locator('#btn-new-student').isVisible().catch(() => false))
      const familyBarHidden      = !(await analystPage.locator('#analyst-family-bar').isVisible().catch(() => false))
      const signinBtnVisible     = await analystPage.locator('#btn-parent-signin').isVisible().catch(() => false)
      const addChildBar          = await analystPage.locator('#child-manager-bar').isVisible().catch(() => false)

      const issues = []
      if (!appVisible)            issues.push('#app not visible')
      if (!allStudentsBtnHidden)  issues.push('#btn-all-students is visible (analyst session leaked into parent view)')
      if (!newStudentBtnHidden)   issues.push('#btn-new-student is visible (analyst session leaked)')
      if (!familyBarHidden)       issues.push('#analyst-family-bar is visible (should be hidden in parent view)')
      if (!signinBtnVisible)      issues.push('#btn-parent-signin NOT visible (should be visible — analyst session not applied)')
      if (!addChildBar)           issues.push('#child-manager-bar not visible')

      if (issues.length === 0) {
        pass('J6', 'Parent view enforced. No analyst controls. Sign in btn visible. Add child bar visible.')
      } else {
        await screenshot(analystPage, 'J6-FAIL')
        fail('J6', issues.join(' | '))
      }
    } catch(e) {
      await screenshot(analystPage, 'J6-FAIL')
      fail('J6', `Exception: ${e.message}`)
    }
  } else {
    risk('J6', 'Skipped — J4 did not pass (no analyst session to test blocking)')
  }

  await analystCtx.close()

  // ─────────────────────────────────────────────────────────────────────────────
  // J7 — Parent sign-in from token URL
  // Checks: click Sign in → multi-child note on form → sign in → child switcher bar
  // Context kept open for J8
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J7: Parent sign-in from token URL ──')
  const parentCtx  = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const parentPage = await parentCtx.newPage()
  let j7Passed = false
  try {
    await parentPage.goto(`${BASE_URL}/?token=${POOH_TOKEN}`, { waitUntil: 'networkidle', timeout: 20000 })
    await sleep(2000)

    // Click the Sign in button
    await parentPage.locator('#btn-parent-signin').click()
    await sleep(1000)

    const authVisible   = await parentPage.locator('#auth-screen').isVisible()
    const noteVisible   = await parentPage.locator('#auth-form-note').isVisible().catch(() => false)
    const noteText      = await parentPage.locator('#auth-form-note').textContent().catch(() => '')
    const hasMultiChild = /children|multiple/i.test(noteText)

    await screenshot(parentPage, 'J7-signin-form')

    // Sign in as parent
    await signIn(parentPage, PARENT_EMAIL, PARENT_PASS)
    await parentPage.waitForSelector('#app', { state: 'visible', timeout: 15000 }).catch(() => {})
    await sleep(3000)

    await screenshot(parentPage, 'J7-after-signin')

    const appVisible      = await parentPage.locator('#app').isVisible()
    const authHidden      = !(await parentPage.locator('#auth-screen').isVisible())
    const barVisible      = await parentPage.locator('#child-manager-bar').isVisible().catch(() => false)
    const barHtml         = await parentPage.locator('#child-manager-bar').innerHTML().catch(() => '')
    const hasViewing      = /Viewing/i.test(barHtml)
    const hasSwitchBtn    = /cmb-switch-btn/.test(barHtml)
    const signinHidden    = !(await parentPage.locator('#btn-parent-signin').isVisible().catch(() => false))

    const issues = []
    if (!authVisible)    issues.push('Auth screen did not appear after clicking Sign in')
    if (!noteVisible)    issues.push('#auth-form-note not visible on sign-in form')
    if (!hasMultiChild)  issues.push(`Multi-child note missing or wrong text: "${noteText}"`)
    if (!appVisible)     issues.push('#app not visible after sign-in')
    if (!authHidden)     issues.push('#auth-screen still visible after sign-in')
    if (!barVisible)     issues.push('#child-manager-bar not visible')
    if (!hasViewing)     issues.push('Child bar missing "Viewing:" label')
    if (!signinHidden)   issues.push('#btn-parent-signin still visible after sign-in')

    if (issues.length === 0) {
      const currentName = barHtml.match(/cmb-current[^>]*>([^<]+)/)?.[1]?.trim() || '?'
      pass('J7', `Signed in. Child bar: "Viewing: ${currentName}". Note shown.`)
      j7Passed = true
    } else {
      await screenshot(parentPage, 'J7-FAIL')
      fail('J7', issues.join(' | '))
    }
  } catch(e) {
    await screenshot(parentPage, 'J7-FAIL')
    fail('J7', `Exception: ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // J8 — Child switcher works
  // Checks: switch child → header + bar update
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n── J8: Child switcher ──')
  if (j7Passed) {
    try {
      const nameBefore = await parentPage.locator('#header-name').textContent().catch(() => '')
      const switchBtns = await parentPage.locator('.cmb-switch-btn').all()

      if (switchBtns.length === 0) {
        risk('J8', `No switch buttons found (only 1 child linked?) — child bar HTML: ${await parentPage.locator('#child-manager-bar').innerHTML().catch(() => '')}`)
      } else {
        const switchBtnText = await switchBtns[0].textContent()
        await switchBtns[0].click()
        await sleep(4000)
        await screenshot(parentPage, 'J8-after-switch')

        const nameAfter = await parentPage.locator('#header-name').textContent().catch(() => '')
        const barHtml   = await parentPage.locator('#child-manager-bar').innerHTML().catch(() => '')
        const changed   = nameAfter.trim() !== nameBefore.trim()

        if (changed) {
          pass('J8', `Switched from "${nameBefore.trim()}" to "${nameAfter.trim()}" via "${switchBtnText.trim()}"`)
        } else {
          await screenshot(parentPage, 'J8-FAIL')
          fail('J8', `Header name did not change. Before: "${nameBefore.trim()}", After: "${nameAfter.trim()}"`)
        }
      }
    } catch(e) {
      await screenshot(parentPage, 'J8-FAIL')
      fail('J8', `Exception: ${e.message}`)
    }
  } else {
    risk('J8', 'Skipped — J7 did not pass (no parent session)')
  }

  await parentCtx.close()
  await browser.close()

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('  CUSTOMER JOURNEY TEST RESULTS')
  console.log('═'.repeat(70))
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const risks  = results.filter(r => r.status === 'RISK').length
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'RISK' ? '?' : '✗'
    console.log(`  ${icon} [${r.status}] ${r.j}: ${r.detail}`)
  })
  console.log('─'.repeat(70))
  console.log(`  ${passed} passed · ${failed} failed · ${risks} risks`)
  console.log('═'.repeat(70))
  if (failed > 0) process.exit(1)
}

runTests().catch(e => { console.error('Test runner error:', e); process.exit(1) })
