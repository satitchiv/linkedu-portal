// Proof test — multi-child feature (revision 2)
// Tests: claim banner, child manager bar CSS, add-child modal, auth guards

const { chromium } = require('playwright')

const BASE = 'http://localhost:8904'
const TOKEN = 'ea300e679a88acf9'  // Satit's analyst test token
const PASS  = []
const FAIL  = []

function pass(msg) { console.log('  PASS:', msg); PASS.push(msg) }
function fail(msg) { console.error('  FAIL:', msg); FAIL.push(msg) }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx     = await browser.newContext()

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Claim banner appears on token view with cleared storage
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[1] Claim banner visibility')
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?token=${TOKEN}`)
    // Clear any stale storage
    await page.evaluate(() => {
      localStorage.removeItem('portal_claimed_dismissed')
      sessionStorage.removeItem('portal_claimed_dismissed')
    })
    await page.reload()
    await page.waitForTimeout(3000)

    const bannerVisible = await page.evaluate(() => {
      const b = document.getElementById('claim-banner')
      return b && b.style.display !== 'none'
    })
    bannerVisible ? pass('Claim banner visible on token view') : fail('Claim banner NOT visible on token view')

    // Verify form fields exist
    const emailInput = await page.$('#claim-email')
    const passInput  = await page.$('#claim-password')
    emailInput ? pass('Email input present') : fail('Email input missing')
    passInput  ? pass('Password input present') : fail('Password input missing')

    await page.close()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: "Not now" dismisses for session only
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[2] "Not now" session-only dismissal')
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?token=${TOKEN}`)
    await page.evaluate(() => {
      localStorage.removeItem('portal_claimed_dismissed')
      sessionStorage.removeItem('portal_claimed_dismissed')
    })
    await page.reload()
    await page.waitForTimeout(3000)

    await page.evaluate(() => {
      const b = document.getElementById('claim-banner')
      if (b) b.style.display = 'block'
    })
    await page.click('button.claim-banner-dismiss')
    await page.waitForTimeout(500)

    const ssFlag = await page.evaluate(() => sessionStorage.getItem('portal_claimed_dismissed'))
    const lsFlag = await page.evaluate(() => localStorage.getItem('portal_claimed_dismissed'))
    ssFlag === '1' ? pass('"Not now" sets sessionStorage flag') : fail('"Not now" did NOT set sessionStorage flag')
    lsFlag === null ? pass('"Not now" does NOT set localStorage flag') : fail('"Not now" wrongly set localStorage flag')

    await page.close()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Claim banner hidden on analyst view (no token in URL)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[3] Claim banner hidden on non-token page')
  {
    const page = await ctx.newPage()
    await page.goto(BASE)
    await page.waitForTimeout(2000)

    const bannerExists = await page.evaluate(() => {
      const b = document.getElementById('claim-banner')
      return b && b.style.display !== 'none'
    })
    bannerExists ? fail('Claim banner visible on non-token page (should be hidden)') : pass('Claim banner correctly hidden on non-token page')

    await page.close()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Claim banner validation — short password rejected
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[4] Claim banner client-side validation')
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?token=${TOKEN}`)
    await page.evaluate(() => {
      localStorage.removeItem('portal_claimed_dismissed')
      sessionStorage.removeItem('portal_claimed_dismissed')
    })
    await page.reload()
    await page.waitForTimeout(3000)
    await page.evaluate(() => { document.getElementById('claim-banner').style.display = 'block' })

    await page.fill('#claim-email', 'test@example.com')
    await page.fill('#claim-password', 'short')
    await page.click('button.claim-banner-btn')
    await page.waitForTimeout(500)

    const msgText = await page.$eval('#claim-msg', el => el.textContent)
    msgText.includes('8') ? pass('Short password rejected with error message') : fail('Short password NOT rejected: ' + msgText)

    await page.close()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: /api/my-students returns 401 with no auth
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[5] /api/my-students auth guard')
  {
    const res = await ctx.request.get(`${BASE}/api/my-students`)
    res.status() === 401 ? pass('/api/my-students returns 401 with no auth') : fail(`/api/my-students returned ${res.status()} instead of 401`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: /api/link-siblings is removed (returns 404), /api/add-child-by-token returns 401
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[6] Endpoint guards')
  {
    const r1 = await ctx.request.post(`${BASE}/api/link-siblings`, {
      data: { student_ids: ['00000000-0000-0000-0000-000000000000'] }
    })
    r1.status() === 404 ? pass('/api/link-siblings correctly returns 404 (removed)') : fail(`/api/link-siblings returned ${r1.status()} instead of 404`)

    const r2 = await ctx.request.post(`${BASE}/api/add-child-by-token`, {
      data: { token: 'abc123' }
    })
    r2.status() === 401 ? pass('/api/add-child-by-token returns 401 with no auth') : fail(`/api/add-child-by-token returned ${r2.status()} instead of 401`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7: Portal loads correctly on token URL (smoke test)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[7] Portal load smoke test')
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?token=${TOKEN}`)
    await page.evaluate(() => {
      localStorage.removeItem('portal_claimed_dismissed')
      sessionStorage.removeItem('portal_claimed_dismissed')
    })
    await page.reload()
    await page.waitForTimeout(3500)

    const appVisible = await page.evaluate(() => {
      const app = document.getElementById('app')
      return app && app.style.display !== 'none'
    })
    appVisible ? pass('App renders on token URL') : fail('App NOT rendered on token URL')

    const headerName = await page.$eval('#header-name', el => el.textContent)
    headerName && headerName !== 'Loading...' ? pass(`Header name set: "${headerName}"`) : fail('Header name still "Loading..."')

    // Switcher should NOT appear on token view
    const switcherVisible = await page.evaluate(() => !!document.getElementById('child-switch-btn'))
    !switcherVisible ? pass('Child switcher not shown in token view') : fail('Child switcher wrongly shown in token view')

    await page.close()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 8: LINE CTA card renders on overview
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[8] LINE CTA card in overview')
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?token=${TOKEN}`)
    await page.evaluate(() => {
      localStorage.removeItem('portal_claimed_dismissed')
      sessionStorage.removeItem('portal_claimed_dismissed')
    })
    await page.reload()
    await page.waitForTimeout(3500)

    // Dismiss the banner so we can see the overview
    await page.evaluate(() => sessionStorage.setItem('portal_claimed_dismissed', '1'))
    await page.evaluate(() => { const b = document.getElementById('claim-banner'); if (b) b.style.display = 'none' })

    const lineCard = await page.$('.line-cta-card, .line-cta-connected')
    lineCard ? pass('LINE CTA element present in overview') : fail('LINE CTA card missing from overview')

    await page.close()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 9: Child manager bar CSS exists
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[9] Child manager bar CSS exists in stylesheet')
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?token=${TOKEN}`)
    await page.waitForTimeout(2000)

    const cssOk = await page.evaluate(() => {
      const sheets = [...document.styleSheets]
      try {
        const rules = sheets.flatMap(s => { try { return [...s.cssRules] } catch(e) { return [] } })
        const selectors = rules.map(r => r.selectorText || '').join(' ')
        return selectors.includes('child-manager-bar') && selectors.includes('cmb-switch-btn') && selectors.includes('cmb-add-btn')
      } catch(e) { return false }
    })
    cssOk ? pass('Child manager bar CSS classes present') : fail('Child manager bar CSS classes missing')

    await page.close()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 10: Add child modal CSS and HTML exist
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[10] Add child modal present')
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?token=${TOKEN}`)
    await page.waitForTimeout(2000)

    const modalOk = await page.evaluate(() => {
      const modal = document.getElementById('add-child-modal')
      const tokenInput = document.getElementById('add-child-token')
      return !!modal && !!tokenInput
    })
    modalOk ? pass('Add child modal HTML present') : fail('Add child modal HTML missing')

    // Sibling panel should NOT exist anymore
    const siblingPanelGone = await page.evaluate(() => !document.getElementById('claim-sibling-panel'))
    siblingPanelGone ? pass('Sibling panel correctly removed') : fail('Sibling panel still present (should be removed)')

    await page.close()
  }

  await browser.close()

  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`PASSED: ${PASS.length} / ${PASS.length + FAIL.length}`)
  if (FAIL.length) {
    console.error(`FAILED: ${FAIL.length}`)
    FAIL.forEach(f => console.error('  ✗', f))
    process.exit(1)
  } else {
    console.log('All tests passed.')
    process.exit(0)
  }
})()
