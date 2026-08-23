<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import EmissionsChart from './components/EmissionsChart.vue'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000' })
const emissions = ref([])
const incidents = ref({ by_month: [], by_type: [], by_severity: [], total_incidents: 0 })
const quality = ref({ flags: [], summary: {}, total_flags: 0 })
const findings = ref([])
const loading = ref(true)
const errors = ref([])
const lastUpdated = ref(null)
const aiFilter = ref('all')
const qualitySource = ref('all')
const qualityAction = ref('all')
const qualityPage = ref(1)
const qualityPageSize = 10

const number = value => new Intl.NumberFormat('en-AU').format(Math.round(Number(value) || 0))
const percent = value => `${Math.round(Number(value) * 100)}%`
const label = value => String(value || '').replaceAll('_', ' ')
const totalEmissions = computed(() => emissions.value.reduce((sum, row) => sum + Number(row.scope1_kg_co2e || 0) + Number(row.scope2_kg_co2e || 0), 0))
const scope1Total = computed(() => emissions.value.reduce((sum, row) => sum + Number(row.scope1_kg_co2e || 0), 0))
const scope2Total = computed(() => emissions.value.reduce((sum, row) => sum + Number(row.scope2_kg_co2e || 0), 0))
const scope1Share = computed(() => totalEmissions.value ? scope1Total.value / totalEmissions.value : 0)
const scope2Share = computed(() => totalEmissions.value ? scope2Total.value / totalEmissions.value : 0)
const latestEmissions = computed(() => emissions.value.at(-1))
const previousEmissions = computed(() => emissions.value.at(-2))
const latestChange = computed(() => {
  if (!latestEmissions.value || !previousEmissions.value) return null
  const latest = Number(latestEmissions.value.scope1_kg_co2e || 0) + Number(latestEmissions.value.scope2_kg_co2e || 0)
  const previous = Number(previousEmissions.value.scope1_kg_co2e || 0) + Number(previousEmissions.value.scope2_kg_co2e || 0)
  return previous ? (latest - previous) / previous : null
})
const psychosocialCount = computed(() => findings.value.filter(item => item.is_psychosocial).length)
const mismatchCount = computed(() => findings.value.filter(item => item.severity_mismatch).length)
const filteredFindings = computed(() => findings.value.filter(item => aiFilter.value === 'all' || (aiFilter.value === 'psychosocial' ? item.is_psychosocial : item.severity_mismatch)))
const qualitySources = computed(() => [...new Set(quality.value.flags.map(flag => flag.source_table))])
const qualityActions = computed(() => [...new Set(quality.value.flags.map(flag => flag.action_taken))])
const filteredQuality = computed(() => quality.value.flags.filter(flag => (qualitySource.value === 'all' || flag.source_table === qualitySource.value) && (qualityAction.value === 'all' || flag.action_taken === qualityAction.value)))
const incidentTypeMax = computed(() => Math.max(...incidents.value.by_type.map(row => row.count), 1))
const qualitySummary = computed(() => Object.entries(quality.value.summary).map(([source, actions]) => ({ source, total: Object.values(actions).reduce((sum, count) => sum + count, 0), actions: Object.entries(actions) })))
const qualityPageCount = computed(() => Math.max(1, Math.ceil(filteredQuality.value.length / qualityPageSize)))
const paginatedQuality = computed(() => filteredQuality.value.slice((qualityPage.value - 1) * qualityPageSize, qualityPage.value * qualityPageSize))
const qualityRangeStart = computed(() => filteredQuality.value.length ? (qualityPage.value - 1) * qualityPageSize + 1 : 0)
const qualityRangeEnd = computed(() => Math.min(qualityPage.value * qualityPageSize, filteredQuality.value.length))
const incidentMax = computed(() => Math.max(...incidents.value.by_month.map(row => row.count), 1))
const latestMonth = computed(() => emissions.value.at(-1)?.month || '2025-01')

watch([qualitySource, qualityAction], () => {
  qualityPage.value = 1
})

watch(filteredQuality, () => {
  qualityPage.value = Math.min(qualityPage.value, qualityPageCount.value)
})

function changeQualityPage(direction) {
  qualityPage.value = Math.min(Math.max(qualityPage.value + direction, 1), qualityPageCount.value)
}

async function loadDashboard() {
  loading.value = true
  errors.value = []
  const requests = [
    ['emissions', api.get('/emissions/monthly')],
    ['incidents', api.get('/incidents/summary')],
    ['quality', api.get('/data-quality-report')],
    ['findings', api.get('/incidents/ai-flags')],
  ]
  const results = await Promise.allSettled(requests.map(([, request]) => request))
  results.forEach((result, index) => {
    const name = requests[index][0]
    if (result.status === 'rejected') {
      errors.value.push(`${label(name)} could not be loaded`)
      return
    }
    const data = result.value.data
    if (name === 'emissions') emissions.value = data.data || []
    if (name === 'incidents') incidents.value = data
    if (name === 'quality') quality.value = data
    if (name === 'findings') findings.value = data.findings || []
  })
  lastUpdated.value = new Date()
  loading.value = false
}

onMounted(() => {
  loadDashboard()
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-lockup"><span class="brand-mark">IR</span><div><p class="eyebrow">IRONBARK RIDGE RESOURCES</p><h1>Operational intelligence</h1></div></div>
      <div class="topbar-meta"><span class="live-dot"></span><span>Live data</span><button class="refresh-button" type="button" @click="loadDashboard">Refresh</button></div>
    </header>
    <main class="dashboard">
      <section class="intro-row"><div><p class="eyebrow accent">SUSTAINABILITY CONTROL ROOM</p><h2>Know what needs attention.</h2><p class="intro-copy">A clear view across emissions, safety signals, and source data confidence.</p></div><div class="period-badge"><span>REPORTING PERIOD</span><strong>Jan 2025 - Jun 2026</strong></div></section>
      <div v-if="errors.length" class="alert" role="alert"><strong>Some data is unavailable.</strong> {{ errors.join(', ') }}. Check that the backend is running and refresh.</div>
      <section class="kpi-grid" aria-label="Key metrics"><article class="kpi-card kpi-primary"><span class="kpi-label">Total emissions</span><strong>{{ loading ? '...' : number(totalEmissions) }}</strong><span class="kpi-meta">kg CO2e across both scopes</span></article><article class="kpi-card"><span class="kpi-label">Safety incidents</span><strong>{{ loading ? '...' : number(incidents.total_incidents) }}</strong><span class="kpi-meta">logged events in period</span></article><article class="kpi-card"><span class="kpi-label">Psychosocial signals</span><strong class="text-coral">{{ loading ? '...' : number(psychosocialCount) }}</strong><span class="kpi-meta">AI-identified for review</span></article><article class="kpi-card"><span class="kpi-label">Data quality flags</span><strong>{{ loading ? '...' : number(quality.total_flags) }}</strong><span class="kpi-meta">issues recorded in audit log</span></article></section>
      <section class="section-block emissions-section"><div class="section-heading"><div><p class="eyebrow accent">CARBON ACCOUNTING</p><h3>Emissions by month</h3></div><span class="section-note">Latest: {{ latestMonth }}</span></div><div class="emissions-layout"><EmissionsChart :data="emissions" :loading="loading" /><div class="scope-summary"><p class="summary-title">Period composition</p><div class="scope-total"><span>Total recorded</span><strong>{{ number(totalEmissions) }} <small>kg CO2e</small></strong></div><div class="scope-track"><span class="scope-one" :style="{ width: `${scope1Share * 100}%` }"></span><span class="scope-two" :style="{ width: `${scope2Share * 100}%` }"></span></div><div class="scope-row"><span><i class="scope-dot scope-one"></i>Scope 1 / fuel</span><strong>{{ number(scope1Total) }}</strong><b>{{ Math.round(scope1Share * 100) }}%</b></div><div class="scope-row"><span><i class="scope-dot scope-two"></i>Scope 2 / electricity</span><strong>{{ number(scope2Total) }}</strong><b>{{ Math.round(scope2Share * 100) }}%</b></div><div v-if="latestChange !== null" class="change-note"><span>Latest month vs prior</span><strong :class="latestChange > 0 ? 'text-coral' : 'text-mint'">{{ latestChange > 0 ? '+' : '' }}{{ Math.round(latestChange * 100) }}%</strong></div></div></div></section>
      <section class="split-grid"><article class="panel"><div class="section-heading"><div><p class="eyebrow">SAFETY REGISTER</p><h3>Incident trend</h3></div><span class="panel-total">{{ number(incidents.total_incidents) }} total</span></div><div v-if="loading" class="loading-line">Loading incident trend...</div><div v-else class="trend-chart"><div v-for="row in incidents.by_month" :key="row.month" class="trend-column"><span class="trend-value">{{ row.count }}</span><div class="trend-bar" :style="{ height: `${Math.max((row.count / incidentMax) * 100, 6)}%` }"></div><span class="trend-label">{{ row.month.slice(2) }}</span></div></div><div class="severity-list"><div v-for="row in incidents.by_severity" :key="row.severity" class="severity-row"><span><i :class="['severity-dot', row.severity?.toLowerCase()]"></i>{{ row.severity }}</span><strong>{{ row.count }}</strong></div></div><div class="type-list"><p class="summary-title">By incident type</p><div v-for="row in incidents.by_type" :key="row.type_code" class="type-row"><span>{{ row.type_code }}</span><div class="type-track"><i :style="{ width: `${(row.count / incidentTypeMax) * 100}%` }"></i></div><strong>{{ row.count }}</strong></div></div></article>
        <article class="panel ai-panel"><div class="section-heading"><div><p class="eyebrow">AI REVIEW QUEUE</p><h3>Signals to investigate</h3></div><span class="ai-model">HAIKU</span></div><div class="filter-tabs"><button :class="{ active: aiFilter === 'all' }" @click="aiFilter = 'all'">All <b>{{ findings.length }}</b></button><button :class="{ active: aiFilter === 'psychosocial' }" @click="aiFilter = 'psychosocial'">Psychosocial <b>{{ psychosocialCount }}</b></button><button :class="{ active: aiFilter === 'mismatch' }" @click="aiFilter = 'mismatch'">Mismatch <b>{{ mismatchCount }}</b></button></div><div v-if="loading" class="loading-line">Loading AI findings...</div><div v-else-if="!filteredFindings.length" class="empty-state">No findings match this filter.</div><div v-else class="finding-list"><div v-for="finding in filteredFindings" :key="finding.incident_id" class="finding-row"><div class="finding-top"><span class="incident-id">{{ finding.incident_id }}</span><span v-if="finding.is_psychosocial" class="tag tag-coral">Psychosocial</span><span v-if="finding.severity_mismatch" class="tag tag-amber">Mismatch</span></div><strong>{{ finding.ai_category }}</strong><div class="evidence-block"><span class="evidence-label">Source description</span><p>“{{ finding.description }}”</p></div><div class="evidence-block ai-evidence"><span class="evidence-label">AI evidence</span><p>“{{ finding.evidence }}”</p></div><div class="finding-foot"><span>Recorded {{ finding.severity_normalised || 'Unknown' }}</span><span>{{ percent(finding.confidence) }} confidence</span></div></div></div></article></section>
      <section class="section-block quality-section"><div class="section-heading"><div><p class="eyebrow">DATA GOVERNANCE</p><h3>Quality audit log</h3></div><span class="section-note">{{ qualityRangeStart }}-{{ qualityRangeEnd }} of {{ filteredQuality.length }} flags · {{ qualityPageSize }} per view</span></div><div class="quality-toolbar"><select v-model="qualitySource" aria-label="Filter by source"><option value="all">All sources</option><option v-for="source in qualitySources" :key="source" :value="source">{{ label(source) }}</option></select><select v-model="qualityAction" aria-label="Filter by action"><option value="all">All actions</option><option v-for="action in qualityActions" :key="action" :value="action">{{ label(action) }}</option></select></div><div v-if="loading" class="loading-line">Loading quality flags...</div><div v-else-if="!filteredQuality.length" class="empty-state">No quality flags match these filters.</div><div v-else><div class="quality-table-wrap"><table><thead><tr><th>Source</th><th>Record</th><th>Issue</th><th>Action</th><th>Justification</th></tr></thead><tbody><tr v-for="flag in paginatedQuality" :key="flag.id"><td><span class="source-name">{{ label(flag.source_table) }}</span></td><td class="mono">{{ flag.source_record_ref }}</td><td>{{ flag.issue_description }}</td><td><span class="action-tag">{{ label(flag.action_taken) }}</span></td><td class="muted-cell">{{ flag.justification }}</td></tr></tbody></table></div><div class="pagination"><span>Page {{ qualityPage }} of {{ qualityPageCount }}</span><div><button type="button" :disabled="qualityPage === 1" @click="changeQualityPage(-1)">Previous</button><button type="button" :disabled="qualityPage === qualityPageCount" @click="changeQualityPage(1)">Next</button></div></div></div></section>
      <footer class="footer-line"><span>Ironbark Ridge sustainability data platform</span><span>Last refreshed {{ lastUpdated ? lastUpdated.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '...' }}</span></footer>
      <section class="section-block quality-overview"><div class="section-heading"><div><p class="eyebrow">QUALITY OVERVIEW</p><h3>Where the issues come from</h3></div><span class="section-note">{{ quality.total_flags }} total flags</span></div><div class="quality-summary"><div v-for="item in qualitySummary" :key="item.source" class="quality-summary-row"><span>{{ label(item.source) }}</span><div class="quality-track"><i :style="{ width: `${quality.total_flags ? (item.total / quality.total_flags) * 100 : 0}%` }"></i></div><strong>{{ item.total }}</strong></div></div></section>
    </main>
  </div>
</template>

<style>
.app-shell { min-height: 100vh; background: radial-gradient(circle at 90% 0%, #e6efe9 0, transparent 32rem), var(--paper); }
.topbar, .dashboard { width: 100%; }
.topbar { align-items: center; display: flex; justify-content: space-between; padding: 32px clamp(18px, 4vw, 56px) 24px; }
.brand-lockup, .topbar-meta, .section-heading, .finding-top, .finding-foot, .severity-row, .footer-line { align-items: center; display: flex; }
.brand-mark { align-items: center; background: var(--forest); color: white; display: flex; font-family: 'Space Grotesk', sans-serif; font-weight: 700; height: 42px; justify-content: center; margin-right: 12px; width: 42px; }
.eyebrow { color: var(--ink-muted); font-size: 10px; font-weight: 700; letter-spacing: .14em; margin: 0 0 3px; }
.accent { color: var(--coral); }
h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; font-weight: 600; letter-spacing: -.035em; margin: 0; }
h1 { font-size: 18px; }
h2 { font-size: clamp(30px, 4vw, 48px); line-height: 1.08; }
h3 { font-size: 21px; }
.topbar-meta { color: var(--ink-muted); font-size: 12px; gap: 8px; }
.live-dot { background: var(--mint); border-radius: 50%; height: 7px; width: 7px; }
.refresh-button { background: transparent; border: 1px solid var(--line); color: var(--forest); cursor: pointer; margin-left: 14px; padding: 8px 13px; }
.refresh-button:hover { border-color: var(--forest); }
.dashboard { padding: 42px clamp(18px, 4vw, 56px) 26px; }
.intro-row { align-items: end; display: flex; justify-content: space-between; margin-bottom: 38px; }
.intro-copy { color: var(--ink-muted); font-size: 15px; margin: 14px 0 0; }
.period-badge { border-left: 2px solid var(--coral); display: grid; gap: 3px; padding: 4px 0 4px 14px; }
.period-badge span, .period-badge strong { font-size: 11px; }
.period-badge span { color: var(--ink-muted); letter-spacing: .1em; }
.period-badge strong { font-weight: 600; }
.alert { background: #fff4df; border-left: 3px solid var(--amber); color: #75551d; font-size: 13px; margin-bottom: 22px; padding: 12px 15px; }
.kpi-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, 1fr); margin-bottom: 28px; }
.kpi-card, .panel, .section-block { background: var(--panel); box-shadow: var(--shadow); }
.kpi-card { border-top: 3px solid var(--line); display: grid; gap: 5px; padding: 19px 20px; }
.kpi-primary { border-top-color: var(--coral); }
.kpi-label, .kpi-meta { color: var(--ink-muted); font-size: 11px; }
.kpi-card strong { font-family: 'Space Grotesk', sans-serif; font-size: 28px; letter-spacing: -.04em; }
.text-coral { color: var(--coral); }
.section-block { margin-bottom: 28px; padding: 25px 27px; }
.section-heading { justify-content: space-between; margin-bottom: 18px; }
.section-note, .panel-total { color: var(--ink-muted); font-size: 12px; }
.split-grid { display: grid; gap: 28px; grid-template-columns: 1fr 1fr; margin-bottom: 28px; }
.panel { min-width: 0; padding: 25px 27px; }
.ai-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
.ai-model, .action-tag { background: #e5f2ed; color: var(--forest); font-size: 10px; font-weight: 700; letter-spacing: .1em; padding: 5px 8px; }
.trend-chart { align-items: end; border-bottom: 1px solid var(--line); display: flex; gap: 5px; height: 182px; justify-content: space-around; padding: 0 2px; }
.trend-column { align-items: center; display: flex; flex: 1; flex-direction: column; height: 100%; justify-content: end; min-width: 0; }
.trend-value, .trend-label { color: var(--ink-muted); font-size: 10px; }
.trend-value { margin-bottom: 5px; }
.trend-label { margin-top: 7px; }
.trend-bar { background: var(--mint); min-height: 5px; width: min(24px, 65%); }
.severity-list { display: grid; gap: 7px; margin-top: 20px; }
.severity-row { color: var(--ink-muted); font-size: 12px; justify-content: space-between; }
.severity-row strong { color: var(--ink); }
.severity-dot { background: var(--mint); border-radius: 50%; display: inline-block; height: 7px; margin-right: 8px; width: 7px; }
.severity-dot.medium { background: var(--amber); }.severity-dot.high { background: var(--coral); }
.filter-tabs { border-bottom: 1px solid var(--line); display: flex; gap: 4px; margin-bottom: 11px; overflow-x: auto; }
.filter-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--ink-muted); cursor: pointer; flex: 0 0 auto; font-size: 11px; padding: 8px 7px; }
.filter-tabs button.active { border-bottom-color: var(--coral); color: var(--ink); }
.filter-tabs b { font-weight: 700; margin-left: 3px; }
.finding-list { display: grid; flex: 1 1 auto; gap: 10px; height: 0; min-height: 0; overflow-y: auto; }
.finding-row { border-left: 2px solid var(--coral); padding: 1px 0 8px 12px; }
.finding-row strong { font-size: 13px; }.finding-row p { color: var(--ink-muted); font-size: 12px; margin: 3px 0; }
.evidence-block { margin-top: 8px; }.evidence-label { color: var(--forest); display: block; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }.evidence-block p { margin-top: 2px; }.ai-evidence { border-left: 2px solid #d9e7e0; margin-top: 7px; padding-left: 8px; }
.finding-top, .finding-foot { gap: 6px; justify-content: flex-start; }.finding-top { margin-bottom: 4px; }.finding-foot { color: var(--ink-muted); font-size: 10px; justify-content: space-between; }
.incident-id, .mono { font-family: monospace; font-size: 10px; }.incident-id { color: var(--forest); }
.tag { font-size: 9px; font-weight: 700; padding: 2px 5px; }.tag-coral { background: #fde9e2; color: #b94d34; }.tag-amber { background: #fff1d3; color: #87620e; }
.quality-toolbar { display: flex; gap: 8px; margin-bottom: 15px; }.quality-toolbar select { background: white; border: 1px solid var(--line); color: var(--ink); font-size: 12px; padding: 8px 10px; }
.quality-table-wrap { height: 480px; overflow: auto; } table { border-collapse: collapse; min-width: 790px; width: 100%; } th, td { border-bottom: 1px solid #edf0ec; padding: 13px 10px; text-align: left; vertical-align: top; } th { color: var(--ink-muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; } td { font-size: 13px; line-height: 1.5; } .source-name { color: var(--forest); font-weight: 600; }.muted-cell { color: var(--ink-muted); }.loading-line, .empty-state { color: var(--ink-muted); font-size: 13px; padding: 28px 0; text-align: center; }.pagination { align-items: center; border-top: 1px solid var(--line); color: var(--ink-muted); display: flex; font-size: 12px; justify-content: space-between; padding-top: 15px; }.pagination div { display: flex; gap: 7px; }.pagination button { background: var(--panel); border: 1px solid var(--line); color: var(--forest); cursor: pointer; font-size: 12px; padding: 7px 11px; }.pagination button:hover:not(:disabled) { border-color: var(--forest); }.pagination button:disabled { color: #b8c1bc; cursor: not-allowed; }.footer-line { border-top: 1px solid var(--line); color: var(--ink-muted); font-size: 11px; justify-content: space-between; padding: 18px 0; }
.emissions-layout { align-items: stretch; display: grid; gap: 24px; grid-template-columns: minmax(0, 2.1fr) minmax(250px, .9fr); }
.scope-summary { align-self: stretch; border-left: 1px solid var(--line); display: flex; flex-direction: column; justify-content: center; padding: 8px 0 8px 28px; }.summary-title { color: var(--ink-muted); font-size: 11px; font-weight: 700; letter-spacing: .1em; margin: 0 0 18px; text-transform: uppercase; }.scope-total { display: grid; gap: 2px; margin-bottom: 16px; }.scope-total span, .scope-row, .change-note { color: var(--ink-muted); font-size: 12px; }.scope-total strong { font-family: 'Space Grotesk', sans-serif; font-size: 24px; }.scope-total small { color: var(--ink-muted); font-family: 'DM Sans', sans-serif; font-size: 10px; font-weight: 400; }.scope-track, .type-track, .quality-track { background: #edf1ed; display: flex; height: 7px; margin-bottom: 16px; overflow: hidden; }.scope-track span { display: block; }.scope-one { background: var(--coral); }.scope-two { background: var(--mint); }.scope-row { align-items: center; display: grid; gap: 7px; grid-template-columns: 1fr auto auto; margin: 11px 0; }.scope-row strong { color: var(--ink); font-size: 11px; }.scope-row b { color: var(--ink-muted); font-size: 10px; font-weight: 500; }.scope-dot { border-radius: 50%; display: inline-block; height: 7px; margin-right: 6px; width: 7px; }.change-note { border-top: 1px solid var(--line); display: flex; justify-content: space-between; margin-top: 20px; padding-top: 14px; }.text-mint { color: var(--mint); }
.type-list { border-top: 1px solid var(--line); margin-top: 20px; padding-top: 17px; }.type-row, .quality-summary-row { align-items: center; display: grid; gap: 10px; grid-template-columns: 76px 1fr auto; margin: 10px 0; }.type-row { color: var(--ink-muted); font-size: 11px; }.type-track, .quality-track { height: 5px; margin: 0; }.type-track i, .quality-track i { background: var(--forest); display: block; }.quality-overview { padding-bottom: 20px; }.quality-summary { display: grid; gap: 4px; grid-template-columns: repeat(4, 1fr); }.quality-summary-row { grid-template-columns: 130px 1fr auto; margin: 0; }.quality-summary-row span { color: var(--ink-muted); font-size: 11px; }.quality-summary-row strong { font-size: 12px; }
@media (max-width: 760px) { .topbar, .dashboard { padding-left: 18px; padding-right: 18px; }.topbar { align-items: flex-start; gap: 15px; }.topbar-meta { align-items: flex-end; flex-direction: column; gap: 3px; }.refresh-button { margin: 4px 0 0; }.intro-row { align-items: flex-start; flex-direction: column; gap: 22px; }.kpi-grid { grid-template-columns: repeat(2, 1fr); }.split-grid { grid-template-columns: 1fr; gap: 18px; }.section-block, .panel { padding: 20px 17px; }.emissions-layout { grid-template-columns: 1fr; gap: 14px; }.scope-summary { border-left: 0; border-top: 1px solid var(--line); padding: 18px 0 0; }.quality-summary { grid-template-columns: repeat(2, 1fr); row-gap: 12px; }.quality-summary-row { grid-template-columns: 1fr auto; }.quality-summary-row .quality-track { grid-column: 1 / -1; grid-row: 2; }.footer-line { align-items: flex-start; flex-direction: column; gap: 5px; } }
@media (max-width: 420px) { .brand-mark { height: 36px; width: 36px; }.brand-lockup h1 { font-size: 15px; }.kpi-card { padding: 14px; }.kpi-card strong { font-size: 23px; } }
</style>