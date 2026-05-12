
const state = {
  summary: null,
  nodes: null,
  economics: null,
  scenarios: null,
  baseline: null,
  regions: null,
  years: {
    province: 2024,
    nodes: 2024,
    economics: 2024,
    regions: 2024,
    scenarios: 2024,
  },
  selectedCostYear: 2024,
  selectedNode: null,
  activeModule: 'province',
  activeSubTab: 'overview',
  activeCategories: new Set(['coal', 'hydro', 'wind', 'pv', 'csp', 'other']),
  capacityBasis: 'withoutStorage',
  selectedPlant: '全部电厂',
  selectedUnitCode: null,
  selectedLookupType: 'unit',
  selectedUnitYearIndex: 0,
  selectedScenarioTech: 'wind',
  selectedScenarioPoint: null,
  selectedRegionalStructureYear: '2030',
  selectedRegionalStructureMetric: 'capacity',
  selectedRegionalCleanMetric: 'nonFossil',
  hoveredUnitPoint: null,
  lockedUnitCode: null,
  externalNodeConsoleOpen: false,
  unitTourTimer: null,
  unitTourIndex: 0,
  playing: {
    province: false,
    nodes: false,
    economics: false,
    regions: false,
    scenarios: false,
  },
  timers: {
    province: null,
    nodes: null,
    economics: null,
    regions: null,
    scenarios: null,
  },
};

const MODULES = {
  province: {
    slider: '#yearSlider',
    label: '#yearLabel',
    button: '#provincePlayButton',
    title: '甘肃省电力转型全景',
  },
  nodes: {
    slider: '#nodeYearSlider',
    label: '#nodeYearLabel',
    button: '#nodePlayButton',
    title: '节点演变与容量分布',
  },
  economics: {
    slider: '#economicsYearSlider',
    label: '#economicsYearLabel',
    button: '#economicsPlayButton',
    title: '煤电度电经济参数',
  },
  regions: {
    slider: '#regionYearSlider',
    label: '#regionYearLabel',
    button: '#regionPlayButton',
    title: '区域差异对比分析',
  },
  scenarios: {
    slider: '#scenarioYearSlider',
    label: '#scenarioYearLabel',
    button: '#scenarioPlayButton',
    title: '情景参数设置',
  },
};

const $ = (selector) => document.querySelector(selector);
const ACCESS_PASSWORD = 'state_grid';
const fmt = (value, digits) => {
  const num = Number(value || 0);
  const d = digits != null ? digits : 2;
  const effectiveD = Math.abs(num) >= 10000 ? Math.min(d, 0) : d;
  return num.toLocaleString('zh-CN', { maximumFractionDigits: effectiveD });
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const escapeAttr = escapeHtml;
const categoryByKey = () => Object.fromEntries(state.summary.categories.map(c => [c.key, c]));
const REGIONAL_STRUCTURE_METRICS = [
  { key: 'capacity', label: '装机结构' },
  { key: 'generation', label: '发电量结构' },
];
const REGIONAL_CLEAN_METRICS = [
  { key: 'nonFossil', label: '非化石能源' },
  { key: 'renewable', label: '可再生能源' },
  { key: 'nonHydroRenewable', label: '非水可再生能源' },
];

function provinceBaseCategories() {
  return state.summary?.categories || [];
}

function provinceStorageCategories() {
  return state.summary?.storageCategories || [
    { key: 'pumpedHydro', label: '抽水蓄能', color: '#155eef' },
    { key: 'electrochemical', label: '电化学储能', color: '#08d5c5' },
  ];
}

function provinceCapacityCategories() {
  return state.capacityBasis === 'withStorage'
    ? [...provinceBaseCategories(), ...provinceStorageCategories()]
    : provinceBaseCategories();
}

function capacityBasisLabel() {
  return state.capacityBasis === 'withStorage' ? '含抽蓄与电化学储能' : '不含抽蓄与电化学储能';
}

function getCapacityRecord(record) {
  return record?.capacity?.[state.capacityBasis] || record?.capacity || {};
}

function getCapacityShareRecord(record) {
  return record?.capacityShare?.[state.capacityBasis] || record?.capacityShare || {};
}
function subtabLabel() {
  const labels = {
    overview: '甘肃省电力转型全景 · 总览',
    scale: '电源规模与结构',
    export: '电力外送与通道建设',
    hours: '设备利用小时',
    clean: '清洁化与碳排放',
    cost: '发电成本',
  };
  return labels[state.activeSubTab] || '甘肃省电力转型全景';
}

const moduleYear = (module = state.activeModule) => Number(state.years[module] ?? state.years.province);

function setModuleYear(module, year) {
  state.years[module] = Number(year);
  if (module === 'economics') state.selectedCostYear = Number(year);
}

function moduleYearRange(module) {
  if (module === 'scenarios' && state.scenarios?.metadata?.yearRange) return state.scenarios.metadata.yearRange;
  if (module === 'regions' && state.regions?.metadata?.yearRange) return state.regions.metadata.yearRange;
  if (module === 'economics' && state.economics?.metadata?.yearRange) return state.economics.metadata.yearRange;
  if (module === 'nodes' && state.nodes?.metadata?.yearRange) return state.nodes.metadata.yearRange;
  return state.summary.metadata.yearRange;
}

function showError(error) {
  $('#loading').hidden = true;
  const box = $('#error');
  box.hidden = false;
  box.innerHTML = `<strong>数据加载失败</strong><p>${error.message || error}</p><p>请在当前目录启动本地服务：<code>python -m http.server 8000</code>，然后打开 <code>http://localhost:8000</code>。</p>`;
}

function unlockDashboard() {
  document.body.classList.remove('auth-locked');
  const gate = $('#authGate');
  if (gate) gate.hidden = true;
  loadData();
}

function initAuthGate() {
  const gate = $('#authGate');
  const form = $('#authForm');
  const input = $('#authPassword');
  const error = $('#authError');

  if (!gate || !form || !input) {
    loadData();
    return;
  }

  input.focus();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const password = input.value.trim();
    if (password === ACCESS_PASSWORD) {
      unlockDashboard();
      return;
    }
    if (error) error.hidden = false;
    input.value = '';
    input.focus();
  });
}

async function loadData() {
  try {
    let summary;
    let nodes;
    let economics;
    let scenarios;
    let baseline;
    let regions;
    if (window.__DASHBOARD_DATA__) {
      summary = window.__DASHBOARD_DATA__.summary;
      nodes = window.__DASHBOARD_DATA__.nodes;
      economics = window.__DASHBOARD_DATA__.economics;
      scenarios = window.__DASHBOARD_DATA__.scenarios;
      baseline = window.__DASHBOARD_DATA__.baseline;
      regions = window.__DASHBOARD_DATA__.regions;
    } else {
      [summary, nodes, economics, scenarios, baseline, regions] = await Promise.all([
        fetch('data/gansu_power_summary.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('无法读取 gansu_power_summary.json'); return r.json(); }),
        fetch('data/node_evolution.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('无法读取 node_evolution.json'); return r.json(); }),
        fetch('data/coal_power_economics.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('无法读取 coal_power_economics.json'); return r.json(); }),
        fetch('data/scenario_parameters.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('无法读取 scenario_parameters.json'); return r.json(); }),
        fetch('data/baseline_scenario.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('无法读取 baseline_scenario.json'); return r.json(); }),
        fetch('data/regional_differences.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('无法读取 regional_differences.json'); return r.json(); }),
      ]);
    }
    state.summary = summary;
    provinceStorageCategories().forEach(cat => state.activeCategories.add(cat.key));
    state.nodes = nodes;
    state.economics = economics;
    state.scenarios = scenarios;
    state.baseline = baseline;
    state.regions = regions;
    const startYear = summary.years[0];
    state.years = { province: startYear, nodes: startYear, economics: startYear, regions: regions?.years?.[0] || startYear, scenarios: scenarios?.years?.[0] || startYear };
    state.selectedCostYear = startYear;
    state.selectedNode = nodes.nodes.find(node => node.name !== EXPORT_CLUSTER_NAME)?.name || nodes.nodes[0]?.name;
    state.selectedPlant = economics.unitEconomics?.plants?.[0] || '全部电厂';
    state.selectedUnitCode = economics.unitEconomics?.units?.[0]?.code || null;
    $('#loading').hidden = true;
    setupControls();
    renderAll();
  } catch (error) {
    showError(error);
  }
}

function setupControls() {
  Object.entries(MODULES).forEach(([module, config]) => {
    const slider = $(config.slider);
    if (!slider) return;
    const [minYear, maxYear] = moduleYearRange(module);
    slider.min = minYear;
    slider.max = maxYear;
    slider.value = moduleYear(module);
    slider.addEventListener('input', (event) => {
      setModuleYear(module, event.target.value);
      syncYearInputs();
      renderAll();
    });
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeModule = tab.dataset.module;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.module').forEach(section => section.classList.toggle('is-active', section.id === `module-${state.activeModule}`));
      renderAll();
    });
  });

  document.querySelectorAll('.sub-nav__tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeSubTab = tab.dataset.subtab;
      document.querySelectorAll('.sub-nav__tab').forEach(t => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.sub-tab-content').forEach(section => section.hidden = section.id !== `subtab-${state.activeSubTab}`);
      renderAll();
    });
  });

  document.querySelectorAll('.play-toggle').forEach(button => button.addEventListener('click', togglePlay));

  document.querySelectorAll('.basis-toggle__button').forEach(button => {
    button.addEventListener('click', () => {
      state.capacityBasis = button.dataset.basis || 'withoutStorage';
      document.querySelectorAll('.basis-toggle__button').forEach(item => {
        item.classList.toggle('is-active', item === button);
      });
      renderAll();
    });
  });

  $('#unitSelect')?.addEventListener('change', (event) => {
    stopUnitTour();
    selectLookupValue(event.target.value);
    renderUnitEconomics();
  });

  $('#unitSelect')?.addEventListener('input', (event) => {
    stopUnitTour();
    renderUnitDropdown(event.target.value);
    showUnitDropdown();
  });

  $('#unitSelect')?.addEventListener('focus', (event) => {
    renderUnitDropdown('');
    showUnitDropdown();
  });

  $('#unitSelect')?.addEventListener('click', () => {
    renderUnitDropdown('');
    showUnitDropdown();
  });

  $('#unitSelect')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    stopUnitTour();
    const first = $('#unitDropdown .unit-dropdown__item');
    if (first) selectDropdownItem(first);
    else {
      selectLookupValue(event.currentTarget.value);
      renderUnitEconomics();
    }
    hideUnitDropdown();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.unit-combo-wrap')) hideUnitDropdown();
  });
}

function syncYearInputs() {
  Object.entries(MODULES).forEach(([module, config]) => {
    const year = moduleYear(module);
    const slider = $(config.slider);
    const label = $(config.label);
    if (slider) slider.value = year;
    if (label) label.textContent = year;
  });
}

function updatePlayButtons() {
  Object.entries(MODULES).forEach(([module, config]) => {
    const button = $(config.button);
    if (!button) return;
    button.textContent = state.playing[module] ? '暂停演示' : '播放演示';
    button.classList.toggle('is-playing', state.playing[module]);
  });
}

function togglePlay(event) {
  const module = Object.entries(MODULES).find(([, config]) => config.button === `#${event.currentTarget.id}`)?.[0] || state.activeModule;
  state.playing[module] = !state.playing[module];
  clearInterval(state.timers[module]);
  state.timers[module] = null;
  updatePlayButtons();
  if (!state.playing[module]) return;

  const [minYear, maxYear] = moduleYearRange(module);
  state.timers[module] = setInterval(() => {
    const nextYear = moduleYear(module) >= maxYear ? minYear : moduleYear(module) + 1;
    setModuleYear(module, nextYear);
    syncYearInputs();
    renderAll();
  }, 900);
}

function getRecord(year = moduleYear('province')) {
  return state.summary.records.find(record => record.year === Number(year));
}

function getEconomicRecord(year = moduleYear('economics')) {
  return state.economics?.records.find(record => record.year === Number(year));
}

function getScenarioRecord(year = moduleYear('scenarios')) {
  return state.scenarios?.records.find(record => record.year === Number(year));
}

function getRegionalCleanRecord(metric = state.selectedRegionalCleanMetric, year = moduleYear('regions')) {
  return state.regions?.clean?.[metric]?.records?.find(record => record.year === Number(year));
}

function getRegionalCarbonRecord(year = moduleYear('regions')) {
  return state.regions?.carbon?.find(record => record.year === Number(year));
}

function getByPath(target, path) {
  return path.reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), target);
}

function capacityWanKw(value) { return Number(value || 0); }

function renderAll() {
  syncYearInputs();
  updatePlayButtons();
  renderHero();
  renderKpis();
  const subtab = state.activeSubTab || 'overview';

  if (subtab === 'overview') {
    renderOverviewSection();
  }
  if (subtab === 'scale') {
    renderLegend();
    renderLineChart('capacityChart', 'capacity');
    renderLineChart('generationChart', 'generation');
    renderShareChart('capacityShare', 'capacityShare');
    renderShareChart('generationShare', 'generationShare');
  }
  if (subtab === 'export') {
    renderExportCharts();
  }
  if (subtab === 'clean') {
    renderCleanCharts();
  }
  if (subtab === 'cost') {
    renderCostCharts();
  }
  renderMap();
  renderSelectedNode();
  renderEconomicsKpis();
  renderEconomicsChart();
  renderCostBreakdown();
  renderUnitEconomics();
  renderBaselineScenarioModule();
  renderScenarioKpis();
  renderScenarioSourceCards();
  renderScenarioFuelCarbonChart();
  renderScenarioQuotaChart();
  renderScenarioGansuCapexChart();
  renderScenarioTechControls();
  renderScenarioRegionalCapexChart();
  renderScenarioMatrix();
  renderRegionalModule();
}

function renderHero() {
  const lead = $('.hero__lead');
  const active = state.activeModule;
  if (active === 'province') {
    const year = moduleYear('province');
    const record = getRecord(year);
    const capacity = getCapacityRecord(record);
    const share = getCapacityShareRecord(record);
    const greenShare = (share.wind || 0) + (share.pv || 0) + (share.csp || 0);
    if (lead) lead.textContent = '当前模块系统展示甘肃省 2024–2060 年电力系统在装机规模、发电结构、电力外送、清洁化水平、碳排放与发电成本方面的长期演变。';
    const subLabel = subtabLabel();
    $('#heroInsight').innerHTML = `
      <span class="insight-label">${subLabel}</span>
      <strong>${year}</strong>
      <p>${capacityBasisLabel()}口径下，总装机 ${fmt(capacityWanKw(capacity.total), 0)} 万千瓦，煤电装机占比 ${fmt(share.coal, 1)}%，风光光热装机占比 ${fmt(greenShare, 1)}%；总发电量 ${fmt(record.generation.total, 0)} 亿千瓦时。</p>
    `;
    return;
  }
  if (active === 'nodes') {
    const year = moduleYear('nodes');
    const yearly = state.nodes.yearly[String(year)]?.nodes || {};
    const internalNodes = state.nodes.nodes.filter(node => !isExternalCluster(node));
    const activeNodes = internalNodes.filter(node => node.buildYear <= year);
    const newNodes = internalNodes.filter(node => node.buildYear === year);
    const activeExternalNodes = allExternalNodes().filter(node => Number(node.buildYear || 0) <= year);
    const newExternalNodes = externalNodesForYear(year);
    const totalCapacity = Object.values(yearly).reduce((sum, item) => sum + (item.total || 0), 0);
    if (lead) lead.textContent = '当前模块重点展示规划节点与外送节点的投建节奏、空间分布与容量承载情况，用于观察新增节点点亮、电源向节点侧集聚及外送接入节点形成过程。';
    $('#heroInsight').innerHTML = `
      <span class="insight-label">节点演变与容量分布</span>
      <strong>${year}</strong>
      <p>已投建省内节点 ${activeNodes.length} 个、外送节点 ${activeExternalNodes.length} 个；当年新增省内节点 ${newNodes.length} 个、外送节点 ${newExternalNodes.length} 个；节点合计容量 ${fmt(totalCapacity, 0)} MW。</p>
    `;
    return;
  }
  if (active === 'scenarios') {
    const year = moduleYear('scenarios');
    const record = getScenarioRecord(year);
    if (!record) return;
    const balance = baselineLineRecord(state.baseline?.powerBalance || [], year);
    if (lead) lead.textContent = '当前模块围绕基准情景展示研究边界、路径推演、电量平衡、CCUS 布局与关键参数；经济与环境参数继续沿用当前界面既有数据口径。';
    $('#heroInsight').innerHTML = `
      <span class="insight-label">基准情景说明与关键参数</span>
      <strong>${year}</strong>
      <p class="scenario-insight-text">${balance ? `甘肃总发电量 ${fmt(balance.generation, 0)} 亿千瓦时，省内用电量 ${fmt(balance.demand, 0)} 亿千瓦时，外送电量 ${fmt(balance.export, 0)} 亿千瓦时；` : ''}经济参数沿用当前界面：甘肃煤价 ${fmt(record.fuel.coal.gansu, 0)} 元/吨，碳价 ${fmt(record.carbon.price, 1)} 元/吨。</p>
    `;
    return;
  }
  if (active === 'regions') {
    const year = moduleYear('regions');
    const clean = getRegionalCleanRecord('nonFossil', year);
    const carbon = getRegionalCarbonRecord(year);
    if (!clean || !carbon) return;
    const genGap = clean.generationShare.gansu - clean.generationShare.national;
    const carbonGap = carbon.intensityGramPerKwh.gansu - carbon.intensityGramPerKwh.national;
    if (lead) lead.textContent = '当前模块从甘肃省、西北地区与全国三个空间尺度，对电源结构、清洁化水平和单位发电量碳排放强度进行横向对比，以呈现甘肃省在全国电力转型进程中的相对位置与差异特征。';
    $('#heroInsight').innerHTML = `
      <span class="insight-label">区域差异对比分析</span>
      <strong>${year}</strong>
      <p>甘肃非化石发电占比 ${fmt(clean.generationShare.gansu, 1)}%，较全国 ${genGap >= 0 ? '高' : '低'} ${fmt(Math.abs(genGap), 1)} 个百分点；单位发电量碳排放 ${fmt(carbon.intensityGramPerKwh.gansu, 1)} 克/千瓦时，较全国 ${carbonGap <= 0 ? '低' : '高'} ${fmt(Math.abs(carbonGap), 1)} 克/千瓦时。</p>
    `;
    return;
  }
  const year = moduleYear('economics');
  const record = getEconomicRecord(year);
  const previous = getEconomicRecord(year - 1);
  const profitChange = previous ? record.profit - previous.profit : 0;
  const costChange = previous ? record.cost - previous.cost : 0;
  if (lead) lead.textContent = '当前模块重点展示煤电机组度电经济性，其中机组年发电成本费用由排放成本、燃料成本、运维成本、财务费用、折旧和 CCS 成本构成，并与年发电利润共同反映度电经济水平。';
  $('#heroInsight').innerHTML = `
    <span class="insight-label">煤电度电经济参数</span>
    <strong>${year}</strong>
    <p>年发电利润 ${fmt(record.profit, 2)} 元/MWh，机组年发电成本费用 ${fmt(record.cost, 2)} 元/MWh，年发电利润同比变化 ${profitChange >= 0 ? '+' : ''}${fmt(profitChange, 2)} 元/MWh，机组年发电成本费用同比变化 ${costChange >= 0 ? '+' : ''}${fmt(costChange, 2)} 元/MWh。</p>
  `;
}

function renderLegend() {
  const cats = provinceCapacityCategories();
  if (!cats.some(cat => state.activeCategories.has(cat.key)) && cats[0]) {
    state.activeCategories.add(cats[0].key);
  }
  $('#categoryLegend').innerHTML = cats.map(cat => `
    <button class="legend-item ${state.activeCategories.has(cat.key) ? '' : 'is-off'}" data-key="${cat.key}" type="button">
      <span class="legend-swatch" style="background:${cat.color}"></span>${cat.label}
    </button>
  `).join('');
  document.querySelectorAll('.legend-item').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.key;
      const visibleKeys = cats.filter(cat => state.activeCategories.has(cat.key)).map(cat => cat.key);
      if (state.activeCategories.has(key) && visibleKeys.length > 1) state.activeCategories.delete(key);
      else state.activeCategories.add(key);
      renderAll();
    });
  });
}

function renderKpis() {
  const r = getRecord();
  const withoutStorage = r.capacity.withoutStorage || r.capacity;
  const withStorage = r.capacity.withStorage || r.capacity;
  const exportData = r.export || { gansu: 0 };
  const emissionData = r.emission || { netEmission: 0 };
  const costTotal = r.costByItem?.total || r.costBySource?.total || 0;
  const cards = [
    ['总装机，不含抽蓄与电化学储能', `${fmt(capacityWanKw(withoutStorage.total), 0)} 万千瓦`, '各电源合计'],
    ['总装机，含抽蓄与电化学储能', `${fmt(capacityWanKw(withStorage.total), 0)} 万千瓦`, '含储能'],
    ['总发电量', `${fmt(r.generation.total)} 亿千瓦时`, '各电源合计'],
    ['甘肃省外送电量', `${fmt(exportData.gansu, 2)} 亿千瓦时`, '外送通道'],
    ['发电净排放量', `${fmt(emissionData.netEmission, 2)} 亿吨`, '碳排放'],
    ['总发电成本', `${fmt(costTotal)} 亿元`, '全口径'],
  ];
  $('#kpiGrid').innerHTML = cards.map(([name, value, note]) => `<div class="kpi"><span>${name}</span><strong>${value}</strong><em>${note}</em></div>`).join('');
}

function provinceLineMetricConfig(metric) {
  if (metric === 'capacity') {
    return {
      unit: '万千瓦',
      categories: provinceCapacityCategories(),
      value: (record, key) => capacityWanKw(getCapacityRecord(record)[key]),
      digits: 0,
      noteId: 'capacityBasisNote',
      note: `${capacityBasisLabel()} · 单位：万千瓦`,
    };
  }
  if (metric === 'generation') {
    return {
      unit: '亿千瓦时',
      categories: provinceBaseCategories(),
      value: (record, key) => record.generation[key],
      digits: 0,
    };
  }
  if (metric === 'capacityShare') {
    return {
      unit: '%',
      categories: provinceCapacityCategories(),
      value: (record, key) => getCapacityShareRecord(record)[key],
      digits: 1,
      fixedMin: 0,
      fixedMax: 100,
      noteId: 'capacityShareBasisNote',
      note: `${capacityBasisLabel()} · 单位：%`,
    };
  }
  return {
    unit: '%',
    categories: provinceBaseCategories(),
    value: (record, key) => record.generationShare[key],
    digits: 1,
    fixedMin: 0,
    fixedMax: 100,
  };
}

function niceTickStep(min, max, minCount = 5) {
  const safeMin = Number.isFinite(min) ? Number(min) : 0;
  const safeMax = Number.isFinite(max) ? Number(max) : safeMin + 1;
  const range = Math.max(Math.abs(safeMax - safeMin), 1);
  const target = Math.max(range / Math.max(minCount - 1, 1), 5);
  const candidates = [];
  for (let exp = 0; exp <= 8; exp++) {
    const pow = Math.pow(10, exp);
    [5, 10, 20, 25, 50, 100].forEach(base => candidates.push(base * pow));
  }
  const sorted = candidates.sort((a, b) => a - b);
  let chosen = sorted[0];
  for (const candidate of sorted) {
    if (candidate <= target) chosen = candidate;
    else break;
  }
  return Math.max(5, chosen);
}

function ticksWithStep(min, max, step, minCount = 5, options = {}) {
  const safeMin = Number.isFinite(min) ? Number(min) : 0;
  const safeMax = Number.isFinite(max) ? Number(max) : safeMin + 1;
  const rawStep = Number.isFinite(step) && step > 0 ? Number(step) : niceTickStep(safeMin, safeMax, minCount);
  const safeStep = options.allowSmallStep ? rawStep : Math.max(5, rawStep);
  const start = safeMin >= 0 ? 0 : Math.floor(safeMin / safeStep) * safeStep;
  let end = Math.ceil(Math.max(safeMax, start + safeStep) / safeStep) * safeStep;
  const ticks = [];
  for (let v = start; v <= end + safeStep * 0.001; v += safeStep) {
    ticks.push(Number(v.toFixed(10)));
  }
  while (ticks.length < minCount) {
    end += safeStep;
    ticks.push(Number(end.toFixed(10)));
  }
  return ticks;
}

function niceTicks(min, max, minCount = 5) {
  let step = niceTickStep(min, max, minCount);
  let ticks = ticksWithStep(min, max, step, minCount);
  while (ticks.length > 9 && step < 100000000) {
    step = step * 2;
    ticks = ticksWithStep(min, max, step, minCount);
  }
  return ticks;
}

function fixedStepTicks(min, max, step, minCount = 5) {
  if (!Number.isFinite(step) || step <= 0) return niceTicks(min, max, minCount);
  return ticksWithStep(min, max, step, minCount, { allowSmallStep: true });
}

function compactTopTicks(ticks, rawMax, minCount = 5) {
  const result = [...(ticks || [])]
    .filter(value => Number.isFinite(Number(value)))
    .map(Number);
  if (result.length < 2 || !Number.isFinite(rawMax)) return result;
  // Never shrink below 5 ticks (Req 1)
  const effectiveMin = Math.max(minCount, 5);
  while (result.length > effectiveMin) {
    const last = result[result.length - 1];
    const prev = result[result.length - 2];
    if (last > rawMax && prev >= rawMax) result.pop();
    else break;
  }
  return result;
}

function chartTicks(minValue, maxValue, rawMax, options = {}) {
  const minCount = options.minCount || 5;
  const baseTicks = Number.isFinite(options.tickStep)
    ? fixedStepTicks(minValue, maxValue, options.tickStep, minCount)
    : niceTicks(minValue, maxValue, minCount);
  return compactTopTicks(baseTicks, rawMax, minCount);
}

function axisBoundsFromTicks(ticks, fallbackMin, fallbackMax) {
  const valid = [...(ticks || [])].filter(value => Number.isFinite(Number(value))).map(Number);
  if (valid.length >= 2) return { min: valid[0], max: valid[valid.length - 1] };
  return { min: fallbackMin, max: fallbackMax };
}

function renderLineChart(containerId, metric) {
  renderProvinceEconomicsStyleLineChart(containerId, metric);
}

function renderShareChart(containerId, shareKey) {
  var container = $('#' + containerId);
  if (!container || !state.summary) return;
  var rows = state.summary.records;
  var year = moduleYear('province');
  var config = provinceLineMetricConfig(shareKey);
  var cats = config.categories.filter(function(c) { return state.activeCategories.has(c.key); });
  if (!cats.length && config.categories[0]) {
    state.activeCategories.add(config.categories[0].key);
    cats = [config.categories[0]];
  }
  var record = rows.find(function(r) { return r.year === year; }) || rows[0];
  var items = cats
    .map(function(cat) { return { label: cat.label, color: cat.color, value: Number(config.value(record, cat.key) || 0) }; })
    .filter(function(item) { return item.value > 0.1; })
    .sort(function(a, b) { return b.value - a.value; });
  var cumPct = 0, slices = [];
  for (var i = 0; i < items.length; i++) {
    var start = cumPct;
    cumPct += items[i].value;
    slices.push(items[i].color + ' ' + start + '% ' + cumPct + '%');
  }
  var sliceStr = slices.join(',');
  var rowsHtml = '';
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    rowsHtml += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.5)">' +
      '<span style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:var(--ink)">' +
      '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + it.color + ';box-shadow:0 0 0 2px rgba(255,255,255,.7)"></span>' + it.label + '</span>' +
      '<span><strong style="font-size:15px;color:var(--ink)">' + fmt(it.value, 2) + '</strong><span style="font-size:13px;color:var(--muted);margin-left:2px">%</span></span></div>';
  }
  container.innerHTML =
    '<div style="display:flex;flex-wrap:wrap;gap:30px;align-items:center;justify-content:center;padding:36px 40px 20px;max-width:900px;margin:0 auto">' +
    '<div style="position:relative;width:200px;height:200px;flex-shrink:0">' +
    '<div style="width:100%;height:100%;border-radius:50%;background:conic-gradient(' + sliceStr + ')"></div>' +
    '<div style="position:absolute;inset:45px;border-radius:50%;background:var(--paper);display:grid;place-items:center;text-align:center;box-shadow:inset 0 0 0 1px rgba(20,32,51,.06)">' +
    '<div><strong style="font-size:28px;color:var(--ink)">' + year + '</strong><br><span style="font-size:13px;color:var(--muted)">各类型占比</span></div></div></div>' +
    '<div style="display:grid;gap:8px;flex:1;min-width:220px">' + rowsHtml + '</div></div>';
}

const PROVINCE_CHART_TITLES = {
  capacityChart: '装机容量演变趋势',
  generationChart: '发电量演变趋势',
  overviewCapacityChart: '总装机量趋势',
  exportChart: '外送电量趋势',
  cleanChart: '清洁化趋势',
  emissionChart: '碳排放与碳汇趋势',
  costSourceChart: '分电源发电成本趋势',
  levelizedCostSourceChart: '分电源度电成本趋势',
  costItemChart: '分成本项发电成本趋势',
};

function renderProvinceEconomicsStyleLineChart(containerId, metric) {
  const container = $(`#${containerId}`);
  if (!container || !state.summary) return;
  const rows = state.summary.records;
  const year = moduleYear('province');
  const config = provinceLineMetricConfig(metric);
  let cats = config.categories.filter(c => state.activeCategories.has(c.key));
  if (!cats.length && config.categories[0]) {
    state.activeCategories.add(config.categories[0].key);
    cats = [config.categories[0]];
  }
  const width = 720, height = 430, pad = { left: 90, right: 24, top: 56, bottom: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = rows.flatMap(row => cats.map(cat => Number(config.value(row, cat.key) || 0)));
  const minValue = Number.isFinite(config.fixedMin) ? config.fixedMin : 0;
  const maxValue = Number.isFinite(config.fixedMax) ? config.fixedMax : Math.max(...values, 1) * 1.12;
  const ticks = chartTicks(minValue, maxValue, Math.max(...values, 1), { tickStep: config.tickStep });
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const minYear = rows[0].year, maxYear = rows[rows.length - 1].year;
  const x = inputYear => pad.left + ((inputYear - minYear) / (maxYear - minYear)) * plotW;
  const y = value => pad.top + plotH - ((Number(value || 0) - axis.min) / (axis.max - axis.min || 1)) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${fmt(tick, config.digits)}</text>`;
  }).join('');

  const legendItemW = 112;
  const legendRows = [];
  for (let i = 0; i < cats.length; i += 4) legendRows.push(cats.slice(i, i + 4));
  const legend = legendRows.map((rowCats, rowIndex) => {
    const rowWidth = rowCats.length * legendItemW;
    const rowStart = (width - rowWidth) / 2;
    return rowCats.map((cat, i) => `<g class="chart-legend-item scenario-legend-item" transform="translate(${rowStart + i * legendItemW}, ${18 + rowIndex * 18})">
      <line x1="0" x2="20" y1="0" y2="0" stroke="${cat.color}" stroke-width="3.2" stroke-linecap="round"></line>
      <circle cx="10" cy="0" r="4.2" fill="${cat.color}"></circle>
      <text class="axis-label scenario-legend-text" x="27" y="4">${cat.label}</text>
    </g>`).join('');
  }).join('');

  const paths = cats.map(cat => {
    const d = rows.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(row.year).toFixed(1)} ${y(config.value(row, cat.key)).toFixed(1)}`).join(' ');
    const points = rows.map(row => {
      const current = row.year === year;
      const value = Number(config.value(row, cat.key) || 0);
      const radius = current ? 5.4 : 3.8;
      const title = `${row.year} ${cat.label} ${fmt(value, config.digits)} ${config.unit}`;
      return `<circle class="chart-point scenario-point ${current ? 'is-current is-selected' : ''}" data-chart="${containerId}" data-series="${cat.key}" data-year="${row.year}" cx="${x(row.year)}" cy="${y(value)}" r="${radius}" fill="${cat.color}"><title>${escapeHtml(title)}</title></circle>`;
    }).join('');
    return `<path class="scenario-line" d="${d}" fill="none" stroke="${cat.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>${points}`;
  }).join('');

  const yearTicks = [minYear, 2030, 2040, 2050, maxYear]
    .filter((tickYear, index, arr) => arr.indexOf(tickYear) === index)
    .map(tickYear => `<text class="axis-label" x="${x(tickYear)}" y="${height - 26}" text-anchor="middle">${tickYear}</text>`).join('');

  const detailPanel = (() => {
    const row = rows.find(r => r.year === year);
    if (!row) return '';
    const items = cats.map(cat => ({
      key: cat.key,
      label: cat.label,
      value: `${fmt(config.value(row, cat.key), config.digits)} ${config.unit}`,
      color: cat.color,
      pointY: y(config.value(row, cat.key)),
    }));
    return renderScenarioDetailPanel({ title: PROVINCE_CHART_TITLES[containerId] || containerId, year, items });
  })();

  container.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + containerId + ' 趋势">' +
    '<text class="axis-label axis-label--x" x="' + (pad.left + plotW / 2) + '" y="' + (height - 6) + '" text-anchor="middle">年份</text>' +
    '<text class="axis-label axis-label--y" x="28" y="' + (pad.top + plotH / 2) + '" text-anchor="middle" transform="rotate(-90 28 ' + (pad.top + plotH / 2) + ')">' + config.unit + '</text>' +
    legend + grid +
    '<line class="current-year-line" x1="' + x(year) + '" y1="' + pad.top + '" x2="' + x(year) + '" y2="' + (pad.top + plotH) + '" />' +
    paths + yearTicks +
  '</svg>' + detailPanel;

  container.querySelectorAll('.scenario-point[data-chart]').forEach(function(target) {
    var activate = function() {
      if (target.dataset.year) {
        setModuleYear('province', target.dataset.year);
        syncYearInputs();
        renderAll();
      }
    };
    target.addEventListener('mouseenter', activate);
    target.addEventListener('click', activate);
  });

  if (config.noteId) {
    var note = $('#' + config.noteId);
    if (note) note.textContent = config.note;
  }
}



function renderEconomicsKpis() {
  const container = $('#economicsKpiGrid');
  if (!container || !state.economics) return;
  const year = moduleYear('economics');
  const record = getEconomicRecord(year);
  if (!record) return;
  const previous = getEconomicRecord(year - 1);
  const profitChange = previous ? record.profit - previous.profit : 0;
  const costChange = previous ? record.cost - previous.cost : 0;
  const cards = [
    ['年发电利润', `${fmt(record.profit, 2)} 元/MWh`, `${year} 年度汇总`],
    ['机组年发电成本费用', `${fmt(record.cost, 2)} 元/MWh`, `${year} 年度汇总`],
    ['年发电利润同比变化', `${profitChange >= 0 ? '+' : ''}${fmt(profitChange, 2)} 元/MWh`, '相对上一年度'],
    ['机组年发电成本费用同比变化', `${costChange >= 0 ? '+' : ''}${fmt(costChange, 2)} 元/MWh`, '相对上一年度'],
  ];
  container.innerHTML = cards.map(([name, value, note]) => `<div class="kpi"><span>${name}</span><strong>${value}</strong><em>${note}</em></div>`).join('');
}

function renderEconomicsChart() {
  const container = $('#economicsChart');
  const containerId = 'economicsChart';
  if (!container || !state.economics) return;
  const rows = state.economics.records;
  const series = state.economics.series;
  const year = moduleYear('economics');
  const width = 980, height = 430, pad = { left: 96, right: 34, top: 58, bottom: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = rows.flatMap(row => series.map(item => row[item.key]));
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);
  const span = rawMax - rawMin || 1;
  const minValue = rawMin >= 0 ? 0 : rawMin - span * 0.08;
  const maxValue = rawMax + span * 0.12;
  const ticks = niceTicks(minValue, maxValue);
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const minYear = rows[0].year, maxYear = rows[rows.length - 1].year;
  const x = yr => pad.left + ((yr - minYear) / (maxYear - minYear)) * plotW;
  const y = value => pad.top + plotH - ((value - axis.min) / (axis.max - axis.min || 1)) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${fmt(tick, 0)}</text>`;
  }).join('');

  const paths = series.map(item => {
    const d = rows.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(row.year).toFixed(1)} ${y(row[item.key]).toFixed(1)}`).join(' ');
    const points = rows.map(row => {
      const current = row.year === year;
      const selected = current;
      const radius = selected ? 7 : current ? 6 : item.key === 'cost' ? 4.8 : 4.2;
      const title = `${row.year} ${item.label} ${fmt(row[item.key], 2)} 元/MWh`;
      return `<circle class="chart-point scenario-point ${current ? 'is-current' : ''} ${selected ? 'is-selected' : ''}" data-chart="${containerId}" data-series="${item.key}" data-year="${row.year}" cx="${x(row.year)}" cy="${y(row[item.key])}" r="${radius}" fill="${item.color}"><title>${escapeHtml(title)}</title></circle>`;
    }).join('');
    return `<path class="economics-line scenario-line" data-chart="${containerId}" data-series="${item.key}" d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.key === 'cost' ? 4.4 : 3.8}" stroke-linecap="round" stroke-linejoin="round"/>${points}`;
  }).join('');

  const yearTicks = [minYear, 2030, 2040, 2050, maxYear].map(yr => `<text class="axis-label" x="${x(yr)}" y="${height - 26}" text-anchor="middle">${yr}</text>`).join('');
  const legendWidth = 500;
  const legendStart = (width - legendWidth) / 2;
  const legend = series.map((item, i) => `<g class="chart-legend-item scenario-legend-item" transform="translate(${legendStart + i * 260}, 24)">
    <line x1="0" x2="26" y1="0" y2="0" stroke="${item.color}" stroke-width="${item.key === 'cost' ? 4.4 : 3.8}" stroke-linecap="round"></line>
    <circle cx="13" cy="0" r="5.2" fill="${item.color}"></circle>
    <text class="axis-label scenario-legend-text" x="36" y="5">${escapeHtml(item.label)}</text>
  </g>`).join('');

  const detailPanel = (() => {
    const row = rows.find(entry => entry.year === year);
    if (!row) return '';
    const items = series.map(item => ({
      key: item.key,
      label: item.label,
      value: `${fmt(row[item.key], 2)} 元/MWh`,
      color: item.color,
      pointY: y(row[item.key]),
    }));
    return renderScenarioDetailPanel({ title: '煤电度电经济参数趋势', year, items });
  })();

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="煤电度电经济参数趋势">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 6}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="32" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 32 ${pad.top + plotH / 2})">元/MWh</text>
    ${legend}
    ${grid}
    <line class="current-year-line" x1="${x(year)}" y1="${pad.top}" x2="${x(year)}" y2="${pad.top + plotH}" />
    ${paths}
    ${yearTicks}
  </svg>${detailPanel}`;

  container.querySelectorAll('.scenario-point[data-chart]').forEach(target => {
    const activate = () => {
      if (target.dataset.year) {
        setModuleYear('economics', target.dataset.year);
        syncYearInputs();
        renderAll();
      }
    };
    target.addEventListener('mouseenter', activate);
    target.addEventListener('click', activate);
  });
}

function renderCostBreakdown() {
  const container = $('#costBreakdown');
  if (!container || !state.economics) return;
  const record = getEconomicRecord(state.selectedCostYear || moduleYear('economics'));
  if (!record) return;
  const breakdown = state.economics.breakdown;
  const values = breakdown.map(item => record.costBreakdown[item.key] || 0);
  const maxAbs = Math.max(...values.map(value => Math.abs(value)), 1);
  const positiveTotal = values.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
  const rows = breakdown.map(item => {
    const value = record.costBreakdown[item.key] || 0;
    const width = Math.min(100, Math.abs(value) / maxAbs * 100);
    const share = record.cost ? value / record.cost * 100 : 0;
    return `<div class="cost-row ${value < 0 ? 'is-negative' : ''}">
      <div class="cost-row__label">${item.label}</div>
      <div class="cost-row__track"><div class="cost-row__fill" style="width:${width}%; background:${item.color}"></div></div>
      <div class="cost-row__value">${fmt(value, 2)} 元/MWh</div>
      <div class="cost-row__share">${fmt(share, 1)}%</div>
    </div>`;
  }).join('');
  container.innerHTML = `
    <div class="cost-breakdown__hero">
      <span>${record.year} 年机组年发电成本费用</span>
      <strong>${fmt(record.cost, 2)} <em>元/MWh</em></strong>
    </div>
    <div class="cost-total-strip">
      <span style="width:${Math.min(100, positiveTotal / Math.max(record.cost, positiveTotal, 1) * 100)}%"></span>
    </div>
    <div class="cost-breakdown__rows">${rows}</div>
  `;
}

function scenarioParameter(pathKey) {
  return state.scenarios?.parameters?.find(item => item.key === pathKey);
}

function visibleScenarioParameters() {
  return (state.scenarios?.parameters || []).filter(item => !item.key.startsWith('fuel.gas.'));
}

function scenarioSeries(pathKey, fallback = {}) {
  const parameter = scenarioParameter(pathKey) || {};
  return {
    key: pathKey,
    label: fallback.label || parameter.label || pathKey,
    unit: fallback.unit || parameter.unit || '',
    color: fallback.color || parameter.color || '#c99a2e',
    width: fallback.width,
    path: parameter.path || pathKey.split('.'),
  };
}

function scenarioValue(record, pathKey) {
  const parameter = scenarioParameter(pathKey);
  const path = parameter?.path || pathKey.split('.');
  return Number(getByPath(record, path) || 0);
}

function scenarioChangeLabel(current, start, unit) {
  const diff = Number(current || 0) - Number(start || 0);
  if (!Number.isFinite(diff) || Math.abs(diff) < 0.0001) return `较2024持平`;
  const pct = start ? diff / start * 100 : 0;
  if (unit === 'tCO₂/MWh') return `较2024 ${diff > 0 ? '+' : ''}${fmt(diff, 3)} ${unit}`;
  return `较2024 ${diff > 0 ? '+' : ''}${fmt(pct, 1)}%`;
}

function renderBaselineScenarioModule() {
  renderBaselineOverview();
  renderBaselineBoundary();
  renderBaselinePathway();
  renderBaselineChartNotes();
  renderBaselineGenerationShareChart();
  renderBaselineRenewableShareChart();
  renderBaselineCcusChart();
  renderBaselinePowerBalanceChart();
  renderBaselineAssumptions();
}

function renderBaselineChartNotes() {
  const mapping = {
    baselineGenerationShareNotes: 'generationShare',
    baselineRenewableShareNotes: 'renewableShare',
    baselineCcusNotes: 'ccusPath',
    baselinePowerBalanceNotes: 'powerBalance',
  };
  Object.entries(mapping).forEach(([id, key]) => {
    const container = $(`#${id}`);
    const notes = state.baseline?.chartInterpretations?.[key] || [];
    if (!container) return;
    container.innerHTML = notes.map((note, index) => `
      <section class="scenario-chart-note">
        <b>${String(index + 1).padStart(2, '0')}</b>
        <div>
          <strong>${escapeHtml(note.label)}</strong>
          <p>${escapeHtml(note.text)}</p>
        </div>
      </section>
    `).join('');
  });
}

function renderBaselineOverview() {
  const baseline = state.baseline;
  const lead = $('#scenarioOverviewLead');
  const kpis = $('#scenarioOverviewKpis');
  if (!baseline) return;
  if (lead) lead.textContent = baseline.overview?.lead || '';
  if (kpis) {
    kpis.innerHTML = (baseline.overview?.kpis || []).map(card => `
      <div class="kpi">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
        <em>${escapeHtml(card.note)}</em>
      </div>
    `).join('');
  }
}

function renderBaselineBoundary() {
  const baseline = state.baseline;
  const boundary = $('#scenarioBoundaryCards');
  const timeline = $('#scenarioSourceTimeline');
  if (!baseline) return;
  if (boundary) {
    boundary.innerHTML = (baseline.boundaries || []).map((group, index) => `
      <section class="scenario-boundary-item">
        <b>${String(index + 1).padStart(2, '0')}</b>
        <div>
          <h4>${escapeHtml(group.title)}</h4>
          <ul>${(group.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
      </section>
    `).join('');
  }
  if (timeline) {
    timeline.innerHTML = (baseline.dataSources || []).map(item => `
      <div class="scenario-source-step">
        <span>${escapeHtml(item.period)}</span>
        <p>${escapeHtml(item.source)}</p>
      </div>
    `).join('');
  }
}

function renderBaselinePathway() {
  const baseline = state.baseline;
  const figure = $('#scenarioPathwayFigure');
  const steps = $('#scenarioPathwaySteps');
  if (!baseline) return;
  if (figure) {
    const fig = baseline.pathwayFigure || {};
    figure.innerHTML = `
      <div class="scenario-word-figure__frame">
        <img src="${escapeAttr(fig.src || '')}" alt="${escapeAttr(fig.title || '转型路径仿真推演思路')}" loading="lazy">
      </div>
      <figcaption>
        <strong>${escapeHtml((fig.title || '转型路径仿真推演思路').replace(/^图\d+\s*/, ''))}</strong>
        <span>${escapeHtml(fig.caption || '')}</span>
      </figcaption>
    `;
  }
  if (steps) {
    steps.innerHTML = (baseline.pathwaySteps || []).map((step, index) => `
      <article class="scenario-pathway-step">
        <i>${index + 1}</i>
        <h4>${escapeHtml(step.title)}</h4>
        <p>${escapeHtml(step.text)}</p>
      </article>
    `).join('');
  }
}

function baselineLineRecord(rows, year) {
  if (!rows?.length) return null;
  const exact = rows.find(row => Number(row.year) === Number(year));
  if (exact) return exact;
  const sorted = [...rows].sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year));
  return sorted[0];
}

function renderBaselineLineChart(containerId, rows, series, options = {}) {
  const container = $(`#${containerId}`);
  if (!container || !rows?.length) return;
  const currentYear = moduleYear('scenarios');
  const width = options.width || 980;
  const height = options.height || 460;
  const pad = options.pad || { left: 96, right: 34, top: 58, bottom: 60 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const minYear = rows[0].year;
  const maxYear = rows[rows.length - 1].year;
  const chartYear = Math.min(Math.max(currentYear, minYear), maxYear);
  const values = rows.flatMap(row => series.map(item => Number(getByPath(row, item.path) || 0)));
  const rawMax = Math.max(...values, 1);
  const rawMin = Math.min(...values, 0);
  const span = rawMax - rawMin || 1;
  const minValue = options.yMin ?? (options.fromZero !== false && rawMin >= 0 ? 0 : rawMin - span * 0.12);
  const maxValue = options.yMax ?? (rawMax + span * 0.18);
  const ticks = options.yTicks || (options.yStep ? (() => {
    const result = [];
    for (let value = minValue; value <= maxValue + options.yStep * 0.001; value += options.yStep) {
      result.push(Number(value.toFixed(6)));
    }
    return result;
  })() : niceTicks(minValue, maxValue));
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const x = value => pad.left + ((value - minYear) / Math.max(maxYear - minYear, 1)) * plotW;
  const y = value => pad.top + plotH - ((Number(value || 0) - axis.min) / Math.max(axis.max - axis.min, 1e-6)) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${fmt(tick, options.tickDigits ?? options.digits ?? 1)}</text>`;
  }).join('');
  const legend = series.map((item, index) => {
    const slot = plotW / Math.max(series.length, 1);
    const xPos = pad.left + index * slot + Math.max(0, (slot - 150) / 2);
    return `<g class="chart-legend-item scenario-legend-item" transform="translate(${xPos}, 24)">
      <line x1="0" x2="26" y1="0" y2="0" stroke="${item.color}" stroke-width="3.8" stroke-linecap="round"></line>
      <circle cx="13" cy="0" r="5.2" fill="${item.color}"></circle>
      <text class="axis-label scenario-legend-text" x="36" y="5">${escapeHtml(item.label)}</text>
    </g>`;
  }).join('');
  const paths = series.map(item => {
    const d = rows.map((row, index) => {
      const value = Number(getByPath(row, item.path) || 0);
      return `${index === 0 ? 'M' : 'L'} ${x(row.year).toFixed(1)} ${y(value).toFixed(1)}`;
    }).join(' ');
    const points = rows.map(row => {
      const current = row.year === chartYear;
      const value = Number(getByPath(row, item.path) || 0);
      const title = `${row.year} ${item.label} ${fmt(value, options.digits ?? 1)}${options.unit ? ` ${options.unit}` : ''}`;
      return `<circle class="chart-point scenario-point ${current ? 'is-current is-selected' : ''}" data-chart="${escapeAttr(containerId)}" data-series="${escapeAttr(item.key)}" data-year="${row.year}" cx="${x(row.year)}" cy="${y(value)}" r="${current ? 6.8 : 4.2}" fill="${item.color}"><title>${escapeHtml(title)}</title></circle>`;
    }).join('');
    return `<path class="scenario-line" d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.width || 3.6}" stroke-linecap="round" stroke-linejoin="round"/>${points}`;
  }).join('');
  const tickCandidates = [minYear, 2030, 2035, 2040, 2050, maxYear];
  const yearTicks = [...new Set(tickCandidates)].filter(year => year >= minYear && year <= maxYear).map(tick => `<text class="axis-label" x="${x(tick)}" y="${height - 26}" text-anchor="middle">${tick}</text>`).join('');
  const detailRow = baselineLineRecord(rows, chartYear);
  const detailPanel = detailRow ? renderScenarioDetailPanel({
    title: options.label || '基准情景路径',
    year: detailRow.year,
    items: series.map(item => {
      const value = Number(getByPath(detailRow, item.path) || 0);
      return {
        key: item.key,
        label: item.label,
        value: `${fmt(value, options.digits ?? 1)}${options.unit ? ` ${options.unit}` : ''}`,
        color: item.color,
      };
    }),
  }) : '';
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(options.label || '基准情景路径')}">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 6}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="26" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 26 ${pad.top + plotH / 2})">${escapeHtml(options.unit || '')}</text>
    ${legend}
    ${grid}
    <line class="current-year-line" x1="${x(chartYear)}" y1="${pad.top}" x2="${x(chartYear)}" y2="${pad.top + plotH}" />
    ${paths}
    ${yearTicks}
  </svg>${detailPanel}`;
  bindScenarioPointEvents(container);
}

function renderBaselineGenerationShareChart() {
  renderBaselineLineChart('baselineGenerationShareChart', state.baseline?.generationShare || [], [
    { key: 'gansu', label: '甘肃省', path: ['gansu'], color: '#c99a2e', width: 4.2 },
    { key: 'northwest', label: '西北地区', path: ['northwest'], color: '#1aa18b', width: 4.0 },
  ], { label: '发电总量占全国比例', unit: '%', digits: 2, tickDigits: 0, yMin: 0, yMax: 25, yStep: 5 });
}

function renderBaselineRenewableShareChart() {
  renderBaselineLineChart('baselineRenewableShareChart', state.baseline?.renewableShare || [], [
    { key: 'gansu', label: '甘肃省', path: ['gansu'], color: '#c99a2e', width: 4.2 },
    { key: 'northwest', label: '西北地区', path: ['northwest'], color: '#1aa18b', width: 4.0 },
  ], { label: '风光发电量占全国比例', unit: '%', digits: 2, tickDigits: 0, yMin: 0, yMax: 35, yStep: 5 });
}

function renderBaselineCcusChart() {
  renderBaselineLineChart('baselineCcusChart', state.baseline?.ccusPath || [], [
    { key: 'gansu', label: '甘肃省', path: ['gansu'], color: '#c99a2e', width: 4.2 },
    { key: 'northwest', label: '西北地区', path: ['northwest'], color: '#1aa18b', width: 4.0 },
    { key: 'national', label: '全国', path: ['national'], color: '#155eef', width: 4.0 },
  ], { label: '煤电 CCUS 改造装机容量', unit: '亿千瓦', digits: 2, tickDigits: 0, yMin: 0, yMax: 7, yStep: 1 });
}

function renderBaselinePowerBalanceChart() {
  renderBaselineLineChart('baselinePowerBalanceChart', state.baseline?.powerBalance || [], [
    { key: 'generation', label: '总发电量', path: ['generation'], color: '#155eef', width: 4.2 },
    { key: 'demand', label: '省内用电量', path: ['demand'], color: '#1aa18b', width: 4.0 },
    { key: 'export', label: '外送电量', path: ['export'], color: '#c99a2e', width: 4.0 },
  ], { label: '甘肃省电量平衡路径', unit: '亿千瓦时', digits: 0, yMin: 0, yMax: 7000, yStep: 1000 });
}

function renderBaselineAssumptions() {
  const container = $('#scenarioAssumptions');
  if (!container || !state.baseline) return;
  container.innerHTML = (state.baseline.powerAssumptions || []).map(group => `
    <section class="scenario-assumption-group">
      <h3>${escapeHtml(group.group)}</h3>
      <div class="scenario-assumption-grid">
        ${(group.items || []).map(item => `
          <article class="scenario-assumption-card">
            <span>${escapeHtml(item.meta)}</span>
            <h4>${escapeHtml(item.title)}</h4>
            <ul>${(item.facts || []).map(fact => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');
}

function renderScenarioKpis() {
  const container = $('#scenarioKpiGrid');
  if (!container || !state.scenarios) return;
  const year = moduleYear('scenarios');
  const r = getScenarioRecord(year);
  const start = getScenarioRecord(state.scenarios.years[0]);
  if (!r || !start) return;
  const cards = [
    ['甘肃入炉标煤价（元/吨）', `${fmt(r.fuel.coal.gansu, 0)}`, '2025 后按回落水平稳定延续'],
    ['碳排放交易权配额（tCO₂/MWh）', `${fmt(r.carbon.quota, 3)}`, '2050 年前线性收敛至零'],
    ['碳排放权价格（元/吨）', `${fmt(r.carbon.price, 1)}`, '2025 后沿长期上行轨迹抬升'],
    ['甘肃新能源造价（元/千瓦）', `陆上风电 ${fmt(r.capex.gansu.wind, 0)} / 光伏 ${fmt(r.capex.gansu.pv, 0)} / 光热 ${fmt(r.capex.gansu.csp, 0)}`, scenarioChangeLabel(r.capex.gansu.pv, start.capex.gansu.pv, '元/千瓦')],
  ];
  container.innerHTML = cards.map(([name, value, note]) => `<div class="kpi"><span>${name}</span><strong>${value}</strong><em>${note}</em></div>`).join('');
}

function renderScenarioSourceCards() {
  const container = $('#scenarioSourceCards');
  if (!container || !state.scenarios) return;
  const cards = (state.scenarios.sourceCards || []).filter(card => card.title !== '燃料价格').map(card => card.title === '碳约束参数' ? {
    ...card,
    title: '碳约束参数',
    method: '配额强度单独按 2050 年前趋零路径呈现，碳价格单独按中长期上行轨迹呈现，两项不再合并展示。'
  } : card);
  cards.unshift({
    title: '甘肃煤价假设',
    source: '甘肃及西北地区入炉标煤价调研、公开能源统计和企业年报共同校核。',
    method: '界面仅展示甘肃省参数：2024 年采用调研水平，2025 起按煤价回落后的水平稳定延续。',
    tone: 'fuel',
  });
  container.innerHTML = cards.map(card => `
    <article class="scenario-source-card scenario-source-card--${escapeAttr(card.tone)}">
      <span>${escapeHtml(card.title)}</span>
      <p><b>来源</b>${escapeHtml(card.source)}</p>
      <p><b>方法</b>${escapeHtml(card.method)}</p>
    </article>
  `).join('');
}

function renderScenarioInfoPanel({ year, anchorX, pad, width, items }) {
  if (!items.length) return '';
  const panelW = items.length > 3 ? 390 : 350;
  const rowH = 25;
  const panelH = 44 + items.length * rowH;
  const panelX = width - pad.right - panelW - 10;
  const panelY = pad.top + 14;
  const rows = items.map((item, index) => {
    const y = 54 + index * rowH;
    return `<g transform="translate(0, ${y})">
      <circle cx="18" cy="-5" r="5.2" fill="${item.color}"></circle>
      <text class="scenario-info-panel__label" x="32" y="0">${escapeHtml(item.label)}</text>
      <text class="scenario-info-panel__value" x="${panelW - 18}" y="0" text-anchor="end">${escapeHtml(item.value)}</text>
    </g>`;
  }).join('');
  return `<g class="scenario-info-panel" transform="translate(${panelX}, ${panelY})">
    <rect width="${panelW}" height="${panelH}" rx="18"></rect>
    <text class="scenario-info-panel__title" x="18" y="28">${year} 年全部曲线信息</text>
    ${rows}
  </g>`;
}

function renderScenarioDetailPanel({ title, year, items }) {
  if (!items.length) return '';
  const rows = items.map(item => `
    <div class="scenario-detail-item">
      <i style="background:${item.color}"></i>
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join('');
  return `<section class="scenario-detail-panel" aria-label="${escapeAttr(title)}${year}年详细信息">
    <div class="scenario-detail-panel__head">
      <span>${escapeHtml(title)} · ${year} 年详细信息</span>
    </div>
    <div class="scenario-detail-panel__grid">${rows}</div>
  </section>`;
}

function renderScenarioSeparateLabels({ year, anchorX, pad, width, height, items }) {
  if (!items.length) return '';
  const placeRight = anchorX < width * 0.58;
  const labelX = placeRight
    ? Math.min(anchorX + 22, width - pad.right - 16)
    : Math.max(anchorX - 22, pad.left + 16);
  const textAnchor = placeRight ? 'start' : 'end';
  const sorted = [...items].sort((a, b) => a.pointY - b.pointY);
  const minGap = 25;
  const top = pad.top + 22;
  const bottom = height - pad.bottom - 16;
  let lastY = top - minGap;
  const placed = sorted.map(item => {
    const y = Math.min(Math.max(item.pointY, top), bottom);
    const labelY = Math.max(y, lastY + minGap);
    lastY = labelY;
    return { ...item, labelY };
  });
  const overflow = placed.length ? placed[placed.length - 1].labelY - bottom : 0;
  if (overflow > 0) placed.forEach(item => { item.labelY -= overflow; });
  return placed.map(item => {
    const joinX = placeRight ? labelX - 8 : labelX + 8;
    return `<g class="scenario-separate-label">
      <line x1="${anchorX}" y1="${item.pointY}" x2="${joinX}" y2="${item.labelY - 5}" stroke="${item.color}" stroke-width="1.4" stroke-dasharray="4 4" opacity=".62"></line>
      <circle cx="${anchorX}" cy="${item.pointY}" r="3.2" fill="${item.color}"></circle>
      <text class="scenario-badge" style="fill:${item.color}" x="${labelX}" y="${item.labelY}" text-anchor="${textAnchor}">${year} · ${escapeHtml(item.label)} · ${escapeHtml(item.value)}</text>
    </g>`;
  }).join('');
}

function renderScenarioEconomicsBadges({ year, anchorX, pad, width, height, items }) {
  if (!items.length) return '';
  const calloutX = Math.min(Math.max(anchorX, pad.left + 150), width - pad.right - 150);
  const top = pad.top + 16;
  const bottom = height - pad.bottom - 6;
  const minGap = 22;
  const sorted = [...items].sort((a, b) => a.pointY - b.pointY);
  let lastY = top - minGap;
  const placed = sorted.map((item, index) => {
    const offset = index % 2 === 0 ? -18 : 24;
    const preferred = Math.min(Math.max(item.pointY + offset, top), bottom);
    const badgeY = Math.max(preferred, lastY + minGap);
    lastY = badgeY;
    return { ...item, badgeY };
  });
  const overflow = placed.length ? placed[placed.length - 1].badgeY - bottom : 0;
  if (overflow > 0) placed.forEach(item => { item.badgeY -= overflow; });
  return placed.map(item => `
    <text class="economics-badge scenario-badge" style="fill:${item.color}" x="${calloutX}" y="${item.badgeY}" text-anchor="middle">${year} · ${escapeHtml(item.label)} · ${escapeHtml(item.value)}</text>
  `).join('');
}

function renderScenarioMultiLineChart(containerId, series, options = {}) {
  const container = $(`#${containerId}`);
  if (!container || !state.scenarios) return;
  const rows = state.scenarios.records || [];
  if (!rows.length) return;
  const year = moduleYear('scenarios');
  const width = options.width || 980;
  const height = options.height || 460;
  const pad = options.pad || { left: 96, right: 34, top: 58, bottom: 60 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = rows.flatMap(row => series.map(item => Number(getByPath(row, item.path) || 0)));
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);
  const span = rawMax - rawMin || 1;
  const minValue = rawMin >= 0 ? 0 : rawMin - span * 0.16;
  const maxValue = options.fromZero ? rawMax * 1.08 : rawMax + span * 0.18;
  const ticks = niceTicks(minValue, maxValue);
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const minYear = rows[0].year;
  const maxYear = rows[rows.length - 1].year;
  const x = value => pad.left + ((value - minYear) / (maxYear - minYear)) * plotW;
  const y = value => pad.top + plotH - ((value - axis.min) / (axis.max - axis.min || 1)) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${fmt(tick, options.digits ?? 0)}</text>`;
  }).join('');
  const paths = series.map(item => {
    const d = rows.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(row.year).toFixed(1)} ${y(getByPath(row, item.path) || 0).toFixed(1)}`).join(' ');
    const points = rows.map(row => {
      const current = row.year === year;
      const selected = current;
      const value = Number(getByPath(row, item.path) || 0);
      const radius = selected ? 7 : current ? 6 : (item.width || 3.8) >= 4.2 ? 4.8 : 4.2;
      const title = `${row.year} ${item.label} ${fmt(value, options.digits ?? 0)}${item.unit ? ` ${item.unit}` : ''}`;
      return `<circle class="chart-point scenario-point ${current ? 'is-current' : ''} ${selected ? 'is-selected' : ''}" data-chart="${escapeAttr(containerId)}" data-series="${escapeAttr(item.key)}" data-year="${row.year}" cx="${x(row.year)}" cy="${y(value)}" r="${radius}" fill="${item.color}"><title>${escapeHtml(title)}</title></circle>`;
    }).join('');
    return `<path class="economics-line scenario-line" data-chart="${escapeAttr(containerId)}" data-series="${escapeAttr(item.key)}" d="${d}" fill="none" stroke="${item.color}" stroke-width="${item.width || 3.8}" stroke-linecap="round" stroke-linejoin="round"/>${points}`;
  }).join('');
  const legend = series.map((item, i) => {
    const slot = plotW / Math.max(series.length, 1);
    const xPos = pad.left + i * slot + Math.max(0, (slot - 132) / 2);
    const yPos = 24;
    return `<g class="chart-legend-item scenario-legend-item" transform="translate(${xPos}, ${yPos})">
      <line x1="0" x2="26" y1="0" y2="0" stroke="${item.color}" stroke-width="3.8" stroke-linecap="round"></line>
      <circle cx="13" cy="0" r="5.2" fill="${item.color}"></circle>
      <text class="axis-label scenario-legend-text" x="36" y="5">${escapeHtml(item.label)}</text>
    </g>`;
  }).join('');
  const yearTicks = [minYear, 2030, 2040, 2050, maxYear].map(tick => `<text class="axis-label" x="${x(tick)}" y="${height - 26}" text-anchor="middle">${tick}</text>`).join('');
  const detailPanel = (() => {
    const row = rows.find(entry => entry.year === year);
    if (!row) return '';
    const items = series.map(item => {
      const value = Number(getByPath(row, item.path) || 0);
      return {
        key: item.key,
        label: item.label,
        value: `${fmt(value, options.digits ?? 0)}${item.unit ? ` ${item.unit}` : ''}`,
        color: item.color,
        pointY: y(value),
      };
    });
    return renderScenarioDetailPanel({
      title: options.label || '情景参数趋势',
      year: row.year,
      items,
    });
  })();
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(options.label || '情景参数趋势')}">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 6}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="24" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 24 ${pad.top + plotH / 2})">${escapeHtml(options.unit || '')}</text>
    ${legend}
    ${grid}
    <line class="current-year-line" x1="${x(year)}" y1="${pad.top}" x2="${x(year)}" y2="${pad.top + plotH}" />
    ${paths}
    ${yearTicks}
  </svg>${detailPanel}`;
  bindScenarioPointEvents(container);
}

function bindScenarioPointEvents(container) {
  const activate = target => {
    if (target.dataset.year) setModuleYear('scenarios', target.dataset.year);
    state.selectedScenarioPoint = {
      chart: target.dataset.chart,
      series: target.dataset.series,
      year: target.dataset.year,
    };
    syncYearInputs();
    renderAll();
  };
  container.querySelectorAll('.scenario-point[data-chart]').forEach(target => {
    target.addEventListener('mouseenter', () => activate(target));
    target.addEventListener('click', () => activate(target));
  });
}

function renderScenarioFuelCarbonChart() {
  renderScenarioMultiLineChart('scenarioFuelCarbonChart', [
    scenarioSeries('fuel.coal.gansu', { label: '甘肃', width: 4.4 }),
    scenarioSeries('fuel.coal.northwestOther', { label: '西北除甘肃', width: 4.1 }),
    scenarioSeries('fuel.coal.nationalOther', { label: '全国除西北', width: 4.1 }),
  ], { unit: '元/吨', label: '区域入炉标煤价路径', digits: 0, fromZero: true });
}

function renderScenarioQuotaChart() {
  const container = $('#scenarioQuotaChart');
  if (!container || !state.scenarios) return;
  const rows = state.scenarios.records || [];
  if (!rows.length) return;
  const year = moduleYear('scenarios');
  const width = 980, height = 430, pad = { left: 96, right: 96, top: 58, bottom: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const minYear = rows[0].year;
  const maxYear = rows[rows.length - 1].year;
  const quotaValues = rows.map(row => Number(row.carbon?.quota || 0));
  const priceValues = rows.map(row => Number(row.carbon?.price || 0));
  const quotaRawMin = Math.min(...quotaValues);
  const quotaRawMax = Math.max(...quotaValues);
  const quotaSpan = quotaRawMax - quotaRawMin || 0.1;
  const quotaStep = Math.max(0.1, Math.ceil((quotaSpan / 5) / 0.1) * 0.1);
  const quotaMin = 0;
  let quotaMax = quotaMin + quotaStep * 5;
  while (quotaMax < quotaRawMax) quotaMax += quotaStep;
  const priceRawMin = Math.min(...priceValues);
  const priceRawMax = Math.max(...priceValues, 100);
  const priceSpan = priceRawMax - priceRawMin || 20;
  const priceMin = Math.floor((priceRawMin - priceSpan * 0.08) / 20) * 20;
  const priceMax = Math.ceil((priceRawMax + priceSpan * 0.08) / 20) * 20;
  const x = value => pad.left + ((value - minYear) / (maxYear - minYear)) * plotW;
  const yQuota = value => pad.top + plotH - ((Number(value || 0) - quotaMin) / Math.max(quotaMax - quotaMin, 1e-6)) * plotH;
  const yPrice = value => pad.top + plotH - ((Number(value || 0) - priceMin) / Math.max(priceMax - priceMin, 1e-6)) * plotH;
  const quotaColor = scenarioParameter('carbon.quota')?.color || '#08d5c5';
  const priceColor = scenarioParameter('carbon.price')?.color || '#f04e2f';
  const tickRatios = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const formatQuotaTick = value => {
    if (Math.abs(value) < 1e-9) return '0';
    return fmt(value, 2).replace(/0+$/, '').replace(/\.$/, '');
  };
  const grid = tickRatios.map(function(ratio) {
    const yy = pad.top + plotH - ratio * plotH;
    const quotaLabel = quotaMin + ratio * (quotaMax - quotaMin);
    const priceLabel = priceMin + ratio * (priceMax - priceMin);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/>
      <text class="axis-label scenario-axis-left" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${formatQuotaTick(quotaLabel)}</text>
      <text class="axis-label scenario-axis-right" x="${width - pad.right + 12}" y="${yy + 4}">${fmt(priceLabel, 0)}</text>`;
  }).join('');
  const quotaPath = rows.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(row.year).toFixed(1)} ${yQuota(row.carbon.quota).toFixed(1)}`).join(' ');
  const pricePath = rows.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(row.year).toFixed(1)} ${yPrice(row.carbon.price).toFixed(1)}`).join(' ');
  const quotaPoints = rows.map(row => {
    const current = row.year === year;
    const selected = current;
    return `<circle class="chart-point scenario-point ${current ? 'is-current' : ''} ${selected ? 'is-selected' : ''}" data-chart="scenarioQuotaChart" data-series="carbon.quota" data-year="${row.year}" cx="${x(row.year)}" cy="${yQuota(row.carbon.quota)}" r="${selected ? 7 : current ? 6 : 4.8}" fill="${quotaColor}"><title>${row.year} 碳排放交易权配额 ${fmt(row.carbon.quota, 3)} tCO₂/MWh</title></circle>`;
  }).join('');
  const pricePoints = rows.map(row => {
    const current = row.year === year;
    const selected = current;
    return `<circle class="chart-point scenario-point ${current ? 'is-current' : ''} ${selected ? 'is-selected' : ''}" data-chart="scenarioQuotaChart" data-series="carbon.price" data-year="${row.year}" cx="${x(row.year)}" cy="${yPrice(row.carbon.price)}" r="${selected ? 7 : current ? 6 : 4.8}" fill="${priceColor}"><title>${row.year} 碳排放权价格 ${fmt(row.carbon.price, 1)} 元/吨</title></circle>`;
  }).join('');
  const yearTicks = [minYear, 2030, 2040, 2050, maxYear].map(tick => `<text class="axis-label" x="${x(tick)}" y="${height - 26}" text-anchor="middle">${tick}</text>`).join('');
  const detailPanel = (() => {
    const row = rows.find(entry => entry.year === year);
    if (!row) return '';
    const items = [
      { key: 'carbon.quota', label: '碳排放交易权配额', value: `${fmt(row.carbon.quota, 3)} tCO₂/MWh`, color: quotaColor, pointY: yQuota(row.carbon.quota) },
      { key: 'carbon.price', label: '碳排放权价格', value: `${fmt(row.carbon.price, 1)} 元/吨`, color: priceColor, pointY: yPrice(row.carbon.price) },
    ];
    return renderScenarioDetailPanel({
      title: '碳排放交易权配额与碳排放权价格路径',
      year: row.year,
      items,
    });
  })();
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="碳排放交易权配额与碳排放权价格路径">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 6}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y scenario-axis-left" x="32" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 32 ${pad.top + plotH / 2})">tCO₂/MWh</text>
    <text class="axis-label axis-label--y scenario-axis-right" x="${width - 28}" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(90 ${width - 28} ${pad.top + plotH / 2})">元/吨</text>
    <g class="chart-legend-item scenario-legend-item" transform="translate(186, 24)">
      <line x1="0" x2="26" y1="0" y2="0" stroke="${quotaColor}" stroke-width="3.8" stroke-linecap="round"></line>
      <circle cx="13" cy="0" r="5.2" fill="${quotaColor}"></circle>
      <text class="axis-label scenario-legend-text" x="36" y="5">碳排放交易权配额</text>
    </g>
    <g class="chart-legend-item scenario-legend-item" transform="translate(566, 24)">
      <line x1="0" x2="26" y1="0" y2="0" stroke="${priceColor}" stroke-width="3.8" stroke-linecap="round"></line>
      <circle cx="13" cy="0" r="5.2" fill="${priceColor}"></circle>
      <text class="axis-label scenario-legend-text" x="36" y="5">碳排放权价格</text>
    </g>
    ${grid}
    <line class="current-year-line" x1="${x(year)}" y1="${pad.top}" x2="${x(year)}" y2="${pad.top + plotH}" />
    <path class="economics-line scenario-line" data-chart="scenarioQuotaChart" data-series="carbon.quota" d="${quotaPath}" fill="none" stroke="${quotaColor}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="economics-line scenario-line" data-chart="scenarioQuotaChart" data-series="carbon.price" d="${pricePath}" fill="none" stroke="${priceColor}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${quotaPoints}
    ${pricePoints}
    ${yearTicks}
  </svg>${detailPanel}`;
  bindScenarioPointEvents(container);
}

function renderScenarioGansuCapexChart() {
  renderScenarioMultiLineChart('scenarioGansuCapexChart', [
    scenarioSeries('capex.gansu.coal', { label: '煤电' }),
    scenarioSeries('capex.gansu.hydro', { label: '水电' }),
    scenarioSeries('capex.gansu.wind', { label: '风电' }),
    scenarioSeries('capex.gansu.pv', { label: '光伏' }),
    scenarioSeries('capex.gansu.csp', { label: '光热' }),
  ], { unit: '元/千瓦', label: '甘肃容量造价路径', digits: 0, fromZero: true });
}

const SCENARIO_TECH_OPTIONS = [
  { key: 'coal', label: '煤电', paths: { gansu: 'capex.gansu.coal', northwestOther: 'capex.northwestOther.coal', nationalOther: 'capex.nationalOther.coal' } },
  { key: 'hydro', label: '水电', paths: { gansu: 'capex.gansu.hydro', northwestOther: 'capex.northwestOther.hydro', nationalOther: 'capex.nationalOther.hydro' } },
  { key: 'wind', label: '风电', paths: { gansu: 'capex.gansu.wind', northwestOther: 'capex.northwestOther.wind', nationalOther: 'capex.nationalOther.onshoreWind' } },
  { key: 'pv', label: '光伏', paths: { gansu: 'capex.gansu.pv', northwestOther: 'capex.northwestOther.pv', nationalOther: 'capex.nationalOther.pv' } },
  { key: 'csp', label: '光热', paths: { gansu: 'capex.gansu.csp', northwestOther: 'capex.northwestOther.csp', nationalOther: 'capex.nationalOther.csp' } },
];

function renderScenarioTechControls() {
  const container = $('#scenarioTechControls');
  if (!container) return;
  container.innerHTML = SCENARIO_TECH_OPTIONS.map(option => `
    <button class="scenario-tech-button ${state.selectedScenarioTech === option.key ? 'is-active' : ''}" data-tech="${option.key}" type="button">${option.label}</button>
  `).join('');
  container.querySelectorAll('.scenario-tech-button').forEach(button => {
    button.addEventListener('click', () => {
      state.selectedScenarioTech = button.dataset.tech;
      renderScenarioTechControls();
      renderScenarioRegionalCapexChart();
    });
  });
}

function renderScenarioRegionalCapexChart() {
  const option = SCENARIO_TECH_OPTIONS.find(item => item.key === state.selectedScenarioTech) || SCENARIO_TECH_OPTIONS[2];
  renderScenarioMultiLineChart('scenarioRegionalCapexChart', [
    { ...scenarioSeries(option.paths.gansu, { label: '甘肃' }), color: '#c99a2e' },
    { ...scenarioSeries(option.paths.northwestOther, { label: '西北除甘肃' }), color: '#18a389' },
    { ...scenarioSeries(option.paths.nationalOther, { label: '全国除西北' }), color: '#155eef' },
  ], { unit: '元/千瓦', label: `${option.label}区域造价对比`, digits: 0, fromZero: true });
}

function renderScenarioMatrix() {
  const container = $('#scenarioMatrix');
  if (!container || !state.scenarios) return;
  const year = moduleYear('scenarios');
  const current = getScenarioRecord(year);
  const start = getScenarioRecord(state.scenarios.years[0]);
  if (!current || !start) return;
  const parameters = visibleScenarioParameters();
  const groups = [...new Set(parameters.map(item => item.group))];
  container.innerHTML = groups.map(group => {
    const rows = parameters.filter(item => item.group === group).map(item => {
      const value = Number(getByPath(current, item.path) || 0);
      const startValue = Number(getByPath(start, item.path) || 0);
      const diff = value - startValue;
      const changed = Math.abs(diff) > 0.0001;
      const changeClass = diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : 'is-flat';
      return `<div class="scenario-matrix-row">
        <div class="scenario-matrix-name"><i style="background:${item.color}"></i>${escapeHtml(item.label)}</div>
        <div class="scenario-matrix-value">${fmt(value, item.unit === 'tCO₂/MWh' ? 3 : item.unit === '元/立方米' ? 1 : 0)} <span>${escapeHtml(item.unit)}</span></div>
        <div class="scenario-matrix-change ${changeClass}">${changed ? scenarioChangeLabel(value, startValue, item.unit) : '较2024持平'}</div>
        <div class="scenario-matrix-method">${escapeHtml(item.methodTag)}</div>
      </div>`;
    }).join('');
    return `<section class="scenario-matrix-group">
      <h3>${escapeHtml(group)}</h3>
      <div class="scenario-matrix-head">
        <span>参数</span><span>${year} 数值</span><span>变化</span><span>设置逻辑</span>
      </div>
      ${rows}
    </section>`;
  }).join('');
}

function unitEconomicsData() {
  return state.economics?.unitEconomics || { years: [], plants: [], units: [] };
}

function validNumbers(values) {
  return values
    .filter(value => Number.isFinite(Number(value)) && Number(value) !== 0)
    .map(Number)
    .sort((a, b) => a - b);
}

function median(values) {
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function unitValue(unit, metric, yearIndex) {
  if (metric === 'profit' || metric === 'cost') return Number(unit.series?.[metric]?.[yearIndex] || 0);
  return Number(unit.costBreakdown?.[metric]?.[yearIndex] || 0);
}

function unitLifecycleStatus(unit, year) {
  const targetYear = Number(year);
  const commissionYear = Number(unit?.commissionYear);
  const retirementYear = Number(unit?.retirementYear);
  if (Number.isFinite(commissionYear) && targetYear < commissionYear) {
    return { key: 'not-built', label: '未投建' };
  }
  if (Number.isFinite(retirementYear) && targetYear >= retirementYear) {
    return { key: 'retired', label: '已退役' };
  }
  return { key: 'active', label: '在役' };
}

function isUnitActiveAt(unit, year) {
  return unitLifecycleStatus(unit, year).key === 'active';
}

function activeUnitValue(unit, metric, yearIndex, years = unitEconomicsData().years) {
  const year = years?.[yearIndex];
  if (!isUnitActiveAt(unit, year)) return null;
  const value = unitValue(unit, metric, yearIndex);
  return Number.isFinite(value) ? value : null;
}

function activeMetricValues(units, metric, years = unitEconomicsData().years) {
  return (units || [])
    .flatMap(unit => years.map((year, yearIndex) => activeUnitValue(unit, metric, yearIndex, years)))
    .filter(value => Number.isFinite(value));
}

function selectedUnit() {
  const units = unitEconomicsData().units || [];
  return units.find(unit => unit.code === state.selectedUnitCode) || units[0] || null;
}

function selectUnitByCode(code) {
  const unit = (unitEconomicsData().units || []).find(item => item.code === code);
  if (!unit) return null;
  state.selectedUnitCode = unit.code;
  state.selectedPlant = unit.plant;
  state.selectedLookupType = 'unit';
  state.lockedUnitCode = unit.code;
  const yearIndex = Number.isFinite(state.selectedUnitYearIndex) ? state.selectedUnitYearIndex : 0;
  state.hoveredUnitPoint = {
    unit,
    year: unitEconomicsData().years[yearIndex],
    yearIndex,
    source: 'profit',
  };
  return unit;
}

function selectPlantByName(plantName) {
  const plant = String(plantName || '').trim();
  const unit = (unitEconomicsData().units || []).find(item => item.plant === plant);
  if (!unit) return null;
  state.selectedPlant = plant;
  state.selectedUnitCode = unit.code;
  state.selectedLookupType = 'plant';
  state.lockedUnitCode = unit.code;
  state.hoveredUnitPoint = {
    unit,
    year: unitEconomicsData().years[0],
    yearIndex: 0,
    source: 'profit',
  };
  return unit;
}

function normalizeLookupText(value) {
  return String(value || '')
    .replace(/^机组\s*[·:：-]\s*/i, '')
    .replace(/^电厂\s*[·:：-]\s*/i, '')
    .replace(/qh_s_/gi, '')
    .replace(/[·•|,，/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchLookupValue(value) {
  const raw = String(value || '').trim();
  const text = normalizeLookupText(raw);
  if (!text) return null;
  const data = unitEconomicsData();
  const unit = findUnitByKeyword(text);
  if (unit) return { type: 'unit', unit };
  return null;
}

function selectLookupValue(value) {
  const matched = matchLookupValue(value);
  if (!matched) return null;
  if (matched.type === 'plant') return selectPlantByName(matched.plant);
  return selectUnitByCode(matched.unit.code);
}

function findUnitByKeyword(keyword) {
  const text = normalizeLookupText(keyword);
  if (!text) return null;
  const units = unitEconomicsData().units || [];
  return units.find(unit => unit.code.toLowerCase() === text)
    || units.find(unit => text.includes(unit.code.toLowerCase()))
    || units.find(unit => unit.code.toLowerCase().includes(text))
    || units.find(unit => unit.name.toLowerCase().includes(text))
    || units.find(unit => text.includes(unit.name.toLowerCase()))
    || units.find(unit => unit.plant.toLowerCase().includes(text));
}

function plantUnits(plant = state.selectedPlant) {
  const units = unitEconomicsData().units || [];
  if (!plant || plant === '全部电厂') return units;
  return units.filter(unit => unit.plant === plant);
}

function plantMetricStats(plant, metric) {
  const values = activeMetricValues(plantUnits(plant), metric);
  const nums = validNumbers(values);
  return {
    max: nums.length ? nums[nums.length - 1] : 0,
    median: median(nums),
    min: nums.length ? nums[0] : 0,
    count: nums.length,
  };
}

function unitMetricStats(unit, metric) {
  const nums = validNumbers(activeMetricValues(unit ? [unit] : [], metric));
  return {
    max: nums.length ? nums[nums.length - 1] : 0,
    median: median(nums),
    min: nums.length ? nums[0] : 0,
    count: nums.length,
  };
}

function metricLabel(metric) {
  return metric === 'profit' ? '年发电利润' : '机组年发电成本费用';
}

function renderUnitEconomics() {
  if (!state.economics?.unitEconomics) return;
  // 与煤电度电经济参数模块的年份滑块同步
  const data = unitEconomicsData();
  const economicsYear = moduleYear('economics');
  const yearIdx = data.years.indexOf(economicsYear);
  if (yearIdx !== -1) {
    state.selectedUnitYearIndex = yearIdx;
  }
  // 清除过期的高亮点（年份或机组不匹配时）
  if (state.hoveredUnitPoint && (state.hoveredUnitPoint.year !== economicsYear || state.hoveredUnitPoint.unit?.code !== state.selectedUnitCode)) {
    state.hoveredUnitPoint = null;
  }
  renderUnitEconomicsControls();
  renderAllUnitsStaticChart('profit', '#allUnitsProfitChart');
  renderAllUnitsStaticChart('cost', '#allUnitsCostChart');
  renderPlantLineChart('profit', '#plantProfitChart');
  renderPlantLineChart('cost', '#plantCostChart');
  renderPlantEconomicsPanel();
}

function renderUnitEconomicsControls() {
  const select = $('#unitSelect');
  const data = unitEconomicsData();
  if (!select || !data.units?.length) return;
  if (!state.selectedUnitCode) state.selectedUnitCode = data.units[0].code;
  const unit = selectedUnit();
  if (document.activeElement !== select) {
    select.value = state.selectedLookupType === 'plant'
      ? `电厂 · ${state.selectedPlant}`
      : (unit ? `${unit.code} · ${unit.name} · ${unit.plant}` : '');
  }
  renderUnitDropdown('');
  const status = $('#unitEconomicsStatus');
  if (status) {
    status.innerHTML = '';
  }
  const button = $('#unitTourButton');
  if (button) {
    button.textContent = state.unitTourTimer ? '暂停演示' : '播放演示';
    button.classList.toggle('is-playing', Boolean(state.unitTourTimer));
  }
}

function dropdownEntries(filter = '') {
  const text = normalizeLookupText(filter);
  const data = unitEconomicsData();
  const units = (data.units || []).map(unit => ({
    type: 'unit',
    value: unit.code,
    title: `${unit.code} · ${unit.name}`,
    meta: unit.plant,
    haystack: `${unit.code} ${unit.name} ${unit.plant}`.toLowerCase(),
  }));
  const entries = units;
  if (!text) return entries;
  const tokens = text.split(' ').filter(Boolean);
  return entries.filter(entry => tokens.every(token => entry.haystack.includes(token)));
}

function renderUnitDropdown(filter = '') {
  const dropdown = $('#unitDropdown');
  if (!dropdown || !state.economics?.unitEconomics) return;
  const entries = dropdownEntries(filter);
  const shown = entries.slice(0, 260);
  const rows = shown.map(entry => `
    <button class="unit-dropdown__item ${entry.type === 'plant' ? 'is-plant' : 'is-unit'}" type="button" data-type="${entry.type}" data-value="${escapeAttr(entry.value)}">
      <strong>${escapeHtml(entry.title)}</strong>
      <span>${escapeHtml(entry.meta)}</span>
    </button>
  `).join('');
  dropdown.innerHTML = `
    <div class="unit-dropdown__head">
      <span>机组 ${unitEconomicsData().units.length} 台</span>
      <span>编号 / 名称 / 电厂</span>
    </div>
    <div class="unit-dropdown__list">${rows || '<div class="unit-dropdown__empty">没有匹配的机组</div>'}</div>
  `;
  dropdown.querySelectorAll('.unit-dropdown__item').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => {
      selectDropdownItem(button);
      hideUnitDropdown();
    });
  });
}

function selectDropdownItem(button) {
  const type = button.dataset.type;
  const value = button.dataset.value;
  if (type === 'plant') selectPlantByName(value);
  else selectUnitByCode(value);
  renderUnitEconomics();
}

function showUnitDropdown() {
  const dropdown = $('#unitDropdown');
  if (dropdown) dropdown.hidden = false;
}

function hideUnitDropdown() {
  const dropdown = $('#unitDropdown');
  if (dropdown) dropdown.hidden = true;
}

function renderPlantEconomicsPanel() {
  const overviewPanel = $('#plantEconomicsOverviewPanel');
  const detailPanel = $('#plantEconomicsDetailPanel');
  if (!overviewPanel && !detailPanel) return;
  const unit = selectedUnit();
  if (!unit) {
    const empty = '<div class="unit-empty-detail">暂无机组数据。</div>';
    if (overviewPanel) overviewPanel.innerHTML = empty;
    if (detailPanel) detailPanel.innerHTML = empty;
    return;
  }
  const profitStats = unitMetricStats(unit, 'profit');
  const costStats = unitMetricStats(unit, 'cost');
  const hover = state.hoveredUnitPoint?.unit?.code === unit.code ? state.hoveredUnitPoint : {
    unit,
    year: unitEconomicsData().years[state.selectedUnitYearIndex || 0],
    yearIndex: state.selectedUnitYearIndex || 0,
    source: 'profit',
  };
  const hoverHtml = hover ? renderHoveredUnitDetail(hover) : '<div class="unit-empty-detail">点击下方曲线年份节点，查看对应年份机组详情。</div>';
  const summaryTitle = `${unit.code} · ${unit.name}`;
  const summaryMeta = `所属电厂：${escapeHtml(unit.plant)}`;
  if (overviewPanel) {
    overviewPanel.innerHTML = `
      <div class="plant-summary">
        <span>当前机组</span>
        <strong>${escapeHtml(summaryTitle)}</strong>
        <em>${summaryMeta}</em>
      </div>
      <div class="plant-stat-grid">
        ${renderMetricStatCard('年发电利润', profitStats)}
        ${renderMetricStatCard('机组年发电成本费用', costStats)}
      </div>
    `;
  }
  if (detailPanel) {
    detailPanel.innerHTML = `<div class="unit-hover-detail unit-hover-detail--standalone">${hoverHtml}</div>`;
  }
}

function renderMetricStatCard(label, stats) {
  return `<div class="plant-stat-card">
    <span>${escapeHtml(label)}</span>
    <dl>
      <div><dt>最大值</dt><dd>${fmt(stats.max, 2)} <em>元/MWh</em></dd></div>
      <div><dt>中位数</dt><dd>${fmt(stats.median, 2)} <em>元/MWh</em></dd></div>
      <div><dt>最小值</dt><dd>${fmt(stats.min, 2)} <em>元/MWh</em></dd></div>
    </dl>
  </div>`;
}

function renderHoveredUnitDetail(point) {
  const { unit, year, yearIndex, source } = point;
  const status = unitLifecycleStatus(unit, year);
  const isActive = status.key === 'active';
  const profit = activeUnitValue(unit, 'profit', yearIndex);
  const cost = activeUnitValue(unit, 'cost', yearIndex);
  const breakdown = unit.costBreakdown || {};
  const base = `
    <h4>当前机组</h4>
    <p><b>年份：</b>${year}</p>
    <p><b>所属电厂：</b>${escapeHtml(unit.plant)}</p>
    <p><b>机组名称：</b>${escapeHtml(unit.name)}</p>
    <p><b>机组编号：</b>${escapeHtml(unit.code)}</p>
    <p><b>投运时间：</b>${unit.commissionYear || '—'}</p>
    <p><b>机组容量：</b>${unit.capacityMw ? `${fmt(unit.capacityMw, 0)} MW` : '—'}</p>
    <p><b>退役时间：</b>${unit.retirementYear || '—'}</p>
    <p><b>机组状态：</b><span class="unit-status-pill unit-status-pill--${escapeAttr(status.key)}">${escapeHtml(status.label)}</span></p>
  `;
  if (!isActive) {
    return `${base}
      <p><b>年发电利润：</b>/</p>
      <p><b>机组年发电成本费用：</b>/</p>
    `;
  }
  return `${base}
    <p><b>年发电利润：</b>${fmt(profit, 2)} 元/MWh</p>
    <p><b>机组年发电成本费用：</b>${fmt(cost, 2)} 元/MWh</p>
    <h4>机组年发电成本费用拆解</h4>
    <p><b>机组年排放成本：</b>${fmt(breakdown.emissionCost?.[yearIndex] || 0, 2)} 元/MWh</p>
    <p><b>机组年燃料成本：</b>${fmt(breakdown.fuelCost?.[yearIndex] || 0, 2)} 元/MWh</p>
    <p><b>机组年运维成本：</b>${fmt(breakdown.omCost?.[yearIndex] || 0, 2)} 元/MWh</p>
    <p><b>机组财务费用：</b>${fmt(breakdown.financeCost?.[yearIndex] || 0, 2)} 元/MWh</p>
    <p><b>年折旧：</b>${fmt(breakdown.depreciation?.[yearIndex] || 0, 2)} 元/MWh</p>
    <p><b>机组CCS成本：</b>${fmt(breakdown.ccsCost?.[yearIndex] || 0, 2)} 元/MWh</p>
  `;
}

function finiteMetricValues(units, metric) {
  return activeMetricValues(units, metric);
}

function chartScale(values) {
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);
  const span = rawMax - rawMin || 1;
  return {
    minValue: rawMin >= 0 ? 0 : rawMin - span * 0.08,
    maxValue: rawMax + span * 0.12,
  };
}

function renderAllUnitsStaticChart(metric, containerSelector) {
  const container = $(containerSelector);
  const data = unitEconomicsData();
  if (!container || !data.years?.length || !data.units?.length) return;
  const years = data.years;
  const units = data.units;
  const values = finiteMetricValues(units, metric);
  const { minValue, maxValue } = chartScale(values);
  const width = 980;
  const height = 430;
  const pad = { left: 96, right: 34, top: 58, bottom: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const color = metric === 'profit' ? '#1aa18b' : '#c99a2e';
  const activeColor = metric === 'profit' ? '#0b7f70' : '#9b6e18';
  const ticks = niceTicks(minValue, maxValue);
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const x = year => pad.left + (year - years[0]) / (years[years.length - 1] - years[0]) * plotW;
  const y = value => pad.top + plotH - (value - axis.min) / Math.max(axis.max - axis.min, 1e-6) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 10}" y="${yy + 4}" text-anchor="end">${fmt(tick, 0)}</text>`;
  }).join('');
  const zeroLine = axis.min < 0 && axis.max > 0
    ? `<line class="zero-line" x1="${pad.left}" y1="${y(0)}" x2="${width - pad.right}" y2="${y(0)}"/>`
    : '';
  const yearTicks = [years[0], 2030, 2040, 2050, years[years.length - 1]]
    .filter((year, index, arr) => arr.indexOf(year) === index)
    .map(year => `<text class="axis-label" x="${x(year)}" y="${height - 26}" text-anchor="middle">${year}</text>`).join('');
  const legend = `<g class="chart-legend-item" transform="translate(${pad.left + 8}, 24)">
    <line x1="0" x2="30" y1="0" y2="0" stroke="${color}" stroke-width="4.2" stroke-linecap="round"></line>
    <text class="axis-label economics-legend-text" x="40" y="5">${metric === 'profit' ? '各机组年发电利润' : '各机组年发电成本费用'}</text>
  </g>`;
  const pathForUnit = (unit) => {
    let drawing = false;
    const d = years.map((year, index) => {
      const value = activeUnitValue(unit, metric, index, years);
      if (value === null) {
        drawing = false;
        return '';
      }
      const command = drawing ? 'L' : 'M';
      drawing = true;
      return `${command} ${x(year).toFixed(1)} ${y(value).toFixed(1)}`;
    }).filter(Boolean).join(' ');
    if (!d) return '';
    const selected = unit.code === state.selectedUnitCode;
    const title = `机组编号：${unit.code || '—'}；机组名称：${unit.name || '—'}；所属电厂：${unit.plant || '—'}`;
    return `<path class="all-unit-line ${selected ? 'is-selected' : ''}" data-unit="${escapeAttr(unit.code)}" data-metric="${metric}" d="${d}" fill="none" stroke="${selected ? activeColor : color}"><title>${escapeHtml(title)}</title></path>`;
  };
  const normalPaths = units.filter(unit => unit.code !== state.selectedUnitCode).map(pathForUnit).join('');
  const selectedPaths = units.filter(unit => unit.code === state.selectedUnitCode).map(pathForUnit).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="机组${metricLabel(metric)}静态分布">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 6}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="32" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 32 ${pad.top + plotH / 2})">元/MWh</text>
    ${legend}
    ${grid}
    ${zeroLine}
    <g class="all-unit-lines">${normalPaths}${selectedPaths}</g>
    ${yearTicks}
  </svg>`;
  container.querySelectorAll('.all-unit-line').forEach(path => {
    path.addEventListener('click', () => {
      const unit = units.find(item => item.code === path.dataset.unit);
      if (!unit) return;
      stopUnitTour();
      selectUnitByCode(unit.code);
      renderUnitEconomics();
    });
  });
}

function renderPlantLineChart(metric, containerSelector) {
  const container = $(containerSelector);
  const containerId = containerSelector.replace('#', '');
  const data = unitEconomicsData();
  if (!container || !data.years?.length) return;
  const years = data.years;
  const unit = selectedUnit();
  const units = unit ? [unit] : [];
  if (!unit) {
    container.innerHTML = '<div class="empty-chart">请选择机组查看曲线。</div>';
    return;
  }
  const values = validNumbers(activeMetricValues(units, metric, years));
  const rawMin = Math.min(0, values[0] || 0);
  const rawMax = values[values.length - 1] || 1;
  const span = rawMax - rawMin || 1;
  const minValue = rawMin >= 0 ? 0 : rawMin - span * 0.08;
  const maxValue = rawMax + span * 0.12;
  const width = 980;
  const height = 430;
  const pad = { left: 96, right: 34, top: 58, bottom: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const color = metric === 'profit' ? '#1aa18b' : '#c99a2e';
  const year = moduleYear('economics');

  const ticks = niceTicks(minValue, maxValue);
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const x = yr => pad.left + (yr - years[0]) / (years[years.length - 1] - years[0]) * plotW;
  const y = value => pad.top + plotH - (value - axis.min) / Math.max(axis.max - axis.min, 1e-6) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${fmt(tick, 0)}</text>`;
  }).join('');

  const yearTicks = [years[0], 2030, 2040, 2050, years[years.length - 1]]
    .filter((yr, index, arr) => arr.indexOf(yr) === index)
    .map(yr => `<text class="axis-label" x="${x(yr)}" y="${height - 26}" text-anchor="middle">${yr}</text>`).join('');

  const legend = `<g class="chart-legend-item scenario-legend-item" transform="translate(${pad.left + 8}, 24)">
    <line x1="0" x2="30" y1="0" y2="0" stroke="${color}" stroke-width="4.2" stroke-linecap="round"></line>
    <circle cx="15" cy="0" r="5.2" fill="${color}"></circle>
    <text class="axis-label scenario-legend-text" x="40" y="5">${escapeHtml(unit.code)} · ${escapeHtml(unit.name)} · ${metricLabel(metric)}</text>
  </g>`;

  const lines = units.map(unit => {
    const points = years.map((yr, index) => {
      const value = activeUnitValue(unit, metric, index, years);
      if (value === null) return null;
      return [x(yr), y(value), yr, index, value];
    }).filter(Boolean);
    const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ');
    const isLocked = state.lockedUnitCode === unit.code;
    const circles = points.map(point => {
      const value = point[4];
      const current = point[2] === year;
      const selected = current;
      const isFocusPoint = state.hoveredUnitPoint?.unit?.code === unit.code && state.hoveredUnitPoint?.yearIndex === point[3] && state.hoveredUnitPoint?.source === (metric === 'cost' ? 'cost' : 'profit');
      const radius = selected ? 7 : current ? 6 : (isFocusPoint ? 6.8 : 4.6);
      const fillColor = isFocusPoint ? color : (selected || current ? color : 'transparent');
      const classes = ['chart-point', 'scenario-point', current ? 'is-current' : '', selected ? 'is-selected' : '', isFocusPoint ? 'is-focus-point' : ''].join(' ');
      return `<circle class="${classes}" data-chart="${containerId}" data-series="${metric}" data-year="${point[2]}" data-year-index="${point[3]}" data-unit="${escapeAttr(unit.code)}" cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="${radius}" fill="${fillColor}"><title>${escapeHtml(point[2])} · ${escapeHtml(unit.name)} · ${metricLabel(metric)} ${fmt(value, 2)} 元/MWh</title></circle>`;
    }).join('');
    return `<g class="unit-line-group ${isLocked ? 'is-locked' : ''}" data-unit="${escapeAttr(unit.code)}"><path class="economics-line scenario-line" data-chart="${containerId}" data-series="${metric}" d="${d}" stroke="${color}" fill="none" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"></path>${circles}</g>`;
  }).join('');

  const detailPanel = (() => {
    const yearIndex = years.indexOf(year);
    if (yearIndex === -1) return '';
    const status = unitLifecycleStatus(unit, year);
    const value = activeUnitValue(unit, metric, yearIndex, years);
    const isActive = status.key === 'active' && value !== null;
    return renderScenarioDetailPanel({
      title: `当前机组${metricLabel(metric)}`,
      year,
      items: [{
        key: metric,
        label: `${unit.code} · ${unit.name}`,
        value: isActive ? `${fmt(value, 2)} 元/MWh` : status.label,
        color,
        pointY: isActive ? y(value) : y(minValue),
      }],
    });
  })();

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="当前机组${metricLabel(metric)}折线图">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 8}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="32" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 32 ${pad.top + plotH / 2})">元/MWh</text>
    ${legend}
    ${grid}
    ${lines}
    ${yearTicks}
  </svg>${detailPanel}`;

  container.querySelectorAll('.scenario-point[data-chart]').forEach(point => {
    const activate = () => {
      const data = unitEconomicsData();
      const unit = data.units.find(item => item.code === point.dataset.unit);
      const yearIndex = Number(point.dataset.yearIndex);
      if (!unit || !Number.isFinite(yearIndex)) return;
      stopUnitTour();
      state.selectedUnitYearIndex = yearIndex;
      state.selectedUnitCode = unit.code;
      state.selectedPlant = unit.plant;
      state.selectedLookupType = 'unit';
      state.lockedUnitCode = state.lockedUnitCode === unit.code ? null : unit.code;
      state.hoveredUnitPoint = {
        unit,
        year: data.years[yearIndex],
        yearIndex,
        source: metric === 'cost' ? 'cost' : 'profit',
      };
      setModuleYear('economics', data.years[yearIndex]);
      syncYearInputs();
      renderUnitEconomics();
    };
    point.addEventListener('mouseenter', activate);
    point.addEventListener('click', activate);
  });
}

function bindUnitPointEvents(el, metric) {
  el.addEventListener('click', () => {
    const data = unitEconomicsData();
    const unit = data.units.find(item => item.code === el.dataset.unit);
    const yearIndex = Number(el.dataset.yearIndex);
    if (!unit || !Number.isFinite(yearIndex)) return;
    stopUnitTour();
    state.selectedUnitYearIndex = yearIndex;
    state.selectedUnitCode = unit.code;
    state.selectedPlant = unit.plant;
    state.selectedLookupType = 'unit';
    state.lockedUnitCode = state.lockedUnitCode === unit.code ? null : unit.code;
    state.hoveredUnitPoint = {
      unit,
      year: data.years[yearIndex],
      yearIndex,
      source: metric === 'cost' ? 'cost' : 'profit',
    };
    renderUnitEconomics();
  });
}

function startUnitTour() {
  const units = unitEconomicsData().units || [];
  if (!units.length) return;
  stopUnitTour();
  const currentIndex = Math.max(0, units.findIndex(unit => unit.code === state.selectedUnitCode));
  state.unitTourIndex = currentIndex;
  const advance = () => {
    const unit = units[state.unitTourIndex % units.length];
    state.unitTourIndex += 1;
    selectUnitByCode(unit.code);
    renderUnitEconomics();
  };
  advance();
  state.unitTourTimer = setInterval(advance, 900);
  renderUnitEconomicsControls();
}

function stopUnitTour() {
  if (state.unitTourTimer) clearInterval(state.unitTourTimer);
  state.unitTourTimer = null;
  renderUnitEconomicsControls();
}

function dominantCategory(categories) {
  const cat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
  return categoryByKey()[cat];
}

const EXPORT_CLUSTER_NAME = '外送节点集群';
const GANSU_OUTLINE_PATH = "M21.9,2.0 L27.9,3.3 L28.2,15.7 L31.9,21.9 L33.4,22.9 L35.8,20.3 L43.2,20.3 L45.0,21.9 L44.7,24.9 L41.3,28.1 L41.3,29.4 L45.0,33.0 L46.8,33.0 L47.4,36.0 L49.2,37.9 L55.5,38.9 L57.4,38.2 L60.8,33.7 L65.5,34.0 L67.6,38.2 L66.6,42.8 L63.7,45.4 L63.7,49.0 L67.3,52.3 L69.7,51.6 L74.2,58.8 L75.5,64.0 L75.0,67.0 L77.6,68.6 L77.9,70.6 L81.0,71.2 L81.0,68.6 L83.6,67.3 L83.9,64.7 L81.0,61.8 L81.5,54.9 L82.9,53.6 L86.3,54.2 L87.1,55.9 L95.5,61.4 L96.0,64.4 L94.4,66.7 L95.2,68.9 L94.7,71.9 L90.2,72.2 L90.0,75.1 L82.6,74.5 L83.1,76.1 L81.5,78.4 L83.4,80.7 L82.3,84.6 L82.6,88.5 L78.7,89.2 L79.7,90.8 L78.9,94.7 L76.3,95.4 L75.8,98.0 L69.5,96.7 L68.1,91.8 L65.8,92.8 L61.0,87.6 L60.3,83.3 L55.8,85.3 L55.8,88.2 L53.4,88.2 L51.1,84.9 L48.2,84.6 L47.1,83.0 L47.9,79.7 L51.3,82.3 L52.9,81.0 L52.9,77.1 L56.0,73.8 L55.5,71.2 L58.9,68.3 L59.2,63.1 L57.4,60.4 L56.6,55.6 L53.2,50.0 L50.5,50.7 L46.8,46.4 L43.2,44.1 L41.6,39.2 L37.6,40.2 L31.9,36.0 L29.8,37.6 L24.5,36.9 L21.9,39.2 L18.7,39.6 L12.7,35.0 L4.8,32.7 L4.3,17.7 L7.9,15.4 L11.6,11.1 L20.6,6.9 L20.6,3.6 Z";

const NETWORK_LAYOUT = {
  "外送节点集群": [
    12,
    42
  ],
  "敦煌": [
    18,
    39
  ],
  "沙洲": [
    25,
    36
  ],
  "莫高": [
    32,
    34
  ],
  "酒泉": [
    40,
    38
  ],
  "河西": [
    46,
    42
  ],
  "甘州": [
    51,
    44
  ],
  "武胜": [
    57,
    48
  ],
  "白银": [
    63,
    53
  ],
  "秦川": [
    65.0,
    56.5
  ],
  "兰州东": [
    64,
    58
  ],
  "熙州": [
    54,
    57
  ],
  "平凉": [
    78,
    57
  ],
  "麦积": [
    72.0,
    82.0
  ],
  "曲子": [
    84.0,
    50.0
  ],
  "水源": [
    61,
    56
  ],
  "武威红沙": [
    54,
    46
  ],
  "靖远": [
    58,
    50
  ],
  "红古": [
    58,
    62
  ],
  "甘南": [
    54.0,
    74.5
  ],
  "陇南": [
    78.0,
    94.0
  ],
  "庆阳西峰": [
    93.0,
    48.0
  ],
  "天水东": [
    78.0,
    90.0
  ],
  "节点42": [
    70.0,
    60.5
  ],
  "节点45": [
    64.0,
    66.0
  ],
  "节点48": [
    47,
    48
  ],
  "节点49": [
    61,
    64
  ],
  "节点52": [
    57.0,
    69.5
  ],
  "节点58": [
    77.5,
    56.5
  ],
  "节点63": [
    44,
    54
  ],
  "节点66": [
    65.0,
    78.0
  ],
  "节点69": [
    38,
    46
  ],
  "节点72": [
    73.0,
    62.5
  ],
  "节点74": [
    70.0,
    80.0
  ],
  "节点75": [
    42.0,
    62.0
  ],
  "节点78": [
    68.0,
    79.0
  ],
  "节点81": [
    49,
    68
  ]
};

const NETWORK_EDGES = [
  [
    "\u6566\u714c",
    "\u6c99\u6d32"
  ],
  [
    "\u6c99\u6d32",
    "\u83ab\u9ad8"
  ],
  [
    "\u83ab\u9ad8",
    "\u9152\u6cc9"
  ],
  [
    "\u9152\u6cc9",
    "\u6cb3\u897f"
  ],
  [
    "\u6cb3\u897f",
    "\u7518\u5dde"
  ],
  [
    "\u7518\u5dde",
    "\u6b66\u80dc"
  ],
  [
    "\u6b66\u80dc",
    "\u767d\u94f6"
  ],
  [
    "\u767d\u94f6",
    "\u79e6\u5ddd"
  ],
  [
    "\u79e6\u5ddd",
    "\u66f2\u5b50"
  ],
  [
    "\u66f2\u5b50",
    "\u5e86\u9633\u897f\u5cf0"
  ],
  [
    "\u79e6\u5ddd",
    "\u5e73\u51c9"
  ],
  [
    "\u5e73\u51c9",
    "\u9ea6\u79ef"
  ],
  [
    "\u9ea6\u79ef",
    "\u5929\u6c34\u4e1c"
  ],
  [
    "\u79e6\u5ddd",
    "\u5170\u5dde\u4e1c"
  ],
  [
    "\u5170\u5dde\u4e1c",
    "\u7199\u5dde"
  ],
  [
    "\u6b66\u80dc",
    "\u6c34\u6e90"
  ],
  [
    "\u6c34\u6e90",
    "\u6b66\u5a01\u7ea2\u6c99"
  ],
  [
    "\u6c34\u6e90",
    "\u9756\u8fdc"
  ],
  [
    "\u5170\u5dde\u4e1c",
    "\u7ea2\u53e4"
  ],
  [
    "\u7ea2\u53e4",
    "\u7518\u5357"
  ],
  [
    "\u7ea2\u53e4",
    "\u9647\u5357"
  ],
  [
    "\u8282\u70b942",
    "\u8282\u70b945"
  ],
  [
    "\u8282\u70b945",
    "\u8282\u70b948"
  ],
  [
    "\u8282\u70b948",
    "\u8282\u70b949"
  ],
  [
    "\u8282\u70b949",
    "\u8282\u70b952"
  ],
  [
    "\u8282\u70b952",
    "\u8282\u70b958"
  ],
  [
    "\u8282\u70b963",
    "\u8282\u70b966"
  ],
  [
    "\u8282\u70b966",
    "\u8282\u70b969"
  ],
  [
    "\u8282\u70b969",
    "\u8282\u70b972"
  ],
  [
    "\u8282\u70b972",
    "\u8282\u70b974"
  ],
  [
    "\u8282\u70b974",
    "\u8282\u70b975"
  ],
  [
    "\u8282\u70b975",
    "\u8282\u70b978"
  ],
  [
    "\u8282\u70b978",
    "\u8282\u70b981"
  ],
  [
    "\u8282\u70b958",
    "\u8282\u70b975"
  ],
  [
    "\u5929\u6c34\u4e1c",
    "\u8282\u70b978"
  ]
];

function networkPosition(node) {
  if (node.name === EXPORT_CLUSTER_NAME) {
    const cluster = state.nodes?.metadata?.externalCluster;
    return { x: Number(cluster?.x ?? node.x ?? 74.5), y: Number(cluster?.y ?? node.y ?? 77) };
  }
  return { x: Number(node.x ?? 50), y: Number(node.y ?? 50) };
}

function externalNodesForYear(year = moduleYear('nodes')) {
  const names = state.nodes?.metadata?.externalNodesByYear?.[String(year)] || [];
  return Array.isArray(names) ? names : [];
}

function allExternalNodes() {
  const nodes = state.nodes?.metadata?.externalNodes || [];
  return [...nodes].sort((a, b) => (Number(a.buildYear || 9999) - Number(b.buildYear || 9999)) || String(a.name).localeCompare(String(b.name), 'zh-CN'));
}

function externalNodeByName(name) {
  return (state.nodes?.metadata?.externalNodes || []).find(node => node.name === name);
}

function externalNodeStatus(node, year = moduleYear('nodes')) {
  const buildYear = Number(node.buildYear || 0);
  if (buildYear === Number(year)) return { key: 'current', label: '本年投运' };
  if (buildYear < Number(year)) return { key: 'built', label: '已并网' };
  return { key: 'future', label: '待投运' };
}

function isExternalCluster(node) {
  return node?.name === EXPORT_CLUSTER_NAME;
}

function renderExternalNodeConsole() {
  if (!state.nodes) return '';
  const year = moduleYear('nodes');
  const newNames = externalNodesForYear(year);
  const externalNodes = allExternalNodes();
  const builtCount = externalNodes.filter(node => Number(node.buildYear || 0) <= year).length;
  const subtitle = newNames.length
    ? `本年新增：${newNames.map(escapeHtml).join('、')}`
    : '本年无新增外送节点';
  const rows = state.externalNodeConsoleOpen ? externalNodes.map(node => {
    const status = externalNodeStatus(node, year);
    const selected = state.selectedNode === node.name;
    return `<button class="external-node-row is-${status.key} ${selected ? 'is-selected' : ''}" type="button" data-external-node="${escapeAttr(node.name)}">
      <span class="external-node-row__name">${escapeHtml(node.name)}</span>
      <span class="external-node-row__year">${escapeHtml(node.buildYear || '—')} 投运</span>
      <em>${status.label}</em>
    </button>`;
  }).join('') : '';
  return `
    <div class="external-node-console map-export-console">
    <button class="external-matrix-button ${state.externalNodeConsoleOpen ? 'is-open' : ''} ${newNames.length ? 'has-new' : ''}" type="button" aria-expanded="${state.externalNodeConsoleOpen}" title="${escapeAttr(EXPORT_CLUSTER_NAME)}">
      <span class="external-matrix-icon" aria-hidden="true">
        <svg viewBox="0 0 42 42">
          <path d="M7 12h28M7 21h28M7 30h28M12 7v28M21 7v28M30 7v28"/>
          <circle cx="21" cy="21" r="16"/>
          <path d="M10 33 33 10"/>
        </svg>
      </span>
      <span class="external-matrix-copy">
        <strong>${EXPORT_CLUSTER_NAME}</strong>
        <small>${subtitle}</small>
      </span>
      <span class="external-matrix-count">${builtCount}/${externalNodes.length}</span>
    </button>
    <div class="external-node-list ${state.externalNodeConsoleOpen ? 'is-open' : ''}">
      ${rows}
    </div>
    </div>
  `;
}

function mapBaseSvg(edgeHtml = '') {
  return `<svg class="base-map network-map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <filter id="softShadow"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#00192a" flood-opacity=".58"/></filter>
      <filter id="dispatchGlow"><feDropShadow dx="0" dy="0" stdDeviation="1.1" flood-color="#39e7ff" flood-opacity=".75"/></filter>
      <pattern id="dispatchGrid" width="4" height="4" patternUnits="userSpaceOnUse">
        <path d="M4 0H0V4" fill="none" stroke="rgba(88,214,255,.16)" stroke-width=".16"/>
      </pattern>
      <linearGradient id="regionWash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#153d56"/>
        <stop offset="48%" stop-color="#0b4c5e"/>
        <stop offset="100%" stop-color="#08263b"/>
      </linearGradient>
    </defs>
    <rect class="dispatch-bg" x="0" y="0" width="100" height="100" rx="3"/>
    <rect class="dispatch-grid" x="0" y="0" width="100" height="100" rx="3" fill="url(#dispatchGrid)"/>
    <path class="region-halo" d="${GANSU_OUTLINE_PATH}" filter="url(#dispatchGlow)"/>
    <path class="region-fill" d="${GANSU_OUTLINE_PATH}"/>
    <path class="region-arc region-boundary" d="${GANSU_OUTLINE_PATH}"/>
    <text class="external-grid-label external-grid-xj" x="3" y="7">新疆电网</text>
    <text class="external-grid-label external-grid-qh" x="12" y="79">青海电网</text>
    <text class="external-grid-label external-grid-nx" x="82" y="43">宁夏电网</text>
    <text class="external-grid-label external-grid-sx" x="86" y="86">陕西电网</text>
    <g class="network-edges" filter="url(#softShadow)">${edgeHtml}</g>
  </svg>`;
}

function renderNetworkEdges(yearly) {
  const year = moduleYear('nodes');
  const nodeMap = Object.fromEntries(state.nodes.nodes.map(node => [node.name, node]));
  const internalEdges = NETWORK_EDGES.map(([from, to]) => {
    const a = nodeMap[from];
    const b = nodeMap[to];
    if (!a || !b) return '';
    const pa = networkPosition(a);
    const pb = networkPosition(b);
    const active = a.buildYear <= year && b.buildYear <= year;
    return `<g class="network-edge ${active ? 'is-active' : 'is-future'}">
      <line class="network-edge-outer" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>
      <line class="network-edge-inner" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>
    </g>`;
  }).join('');
  const externalMap = Object.fromEntries((state.nodes.metadata?.externalNodes || []).map(node => [node.name, node]));
  const externalEdges = (state.nodes.metadata?.externalEdges || []).map(edge => {
    const a = externalMap[edge.from];
    const b = nodeMap[edge.to];
    if (!a || !b) return '';
    const active = Number(a.buildYear || 0) <= year && Number(b.buildYear || 0) <= year;
    const isNew = Number(a.buildYear || 0) === year;
    return `<g class="network-edge external-edge ${active ? 'is-active' : 'is-future'} ${isNew ? 'is-new' : ''}">
      <line class="external-edge-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
    </g>`;
  }).join('');
  return `${internalEdges}${externalEdges}`;
}

function renderMap() {
  if (!state.nodes) return;
  const year = moduleYear('nodes');
  const yearly = state.nodes.yearly[String(year)]?.nodes || {};
  const maxTotal = Math.max(...Object.values(yearly).map(n => n.total), 1);
  const edgesHtml = renderNetworkEdges(yearly);
  const nodesHtml = state.nodes.nodes.filter(node => !isExternalCluster(node)).map(node => {
    const data = yearly[node.name] || { total: 0, categories: {} };
    const active = node.buildYear <= year;
    const externalNewNames = isExternalCluster(node) ? externalNodesForYear(year) : [];
    const isNew = node.buildYear === year || externalNewNames.length > 0;
    const selected = state.selectedNode === node.name;
    const size = active ? 8 + Math.sqrt(data.total / maxTotal) * (isExternalCluster(node) ? 15 : 11) : 7;
    const cat = dominantCategory(data.categories || {});
    const pos = networkPosition(node);
    const className = `map-node network-node ${isExternalCluster(node) ? 'is-export-cluster' : ''} ${active ? '' : 'is-future'} ${isNew ? 'is-new' : ''} ${selected ? 'is-selected' : ''}`;
    return `<button class="${className}" style="left:${pos.x}%; top:${pos.y}%; width:${size}px; height:${size}px; --node-color:${cat.color}" data-node="${escapeAttr(node.name)}" title="${escapeAttr(`${node.name} - ${fmt(data.total, 0)} MW - ${node.buildYear} build`)}" type="button"><span class="node-label">${escapeHtml(node.name)}</span></button>`;
  }).join('');
  const externalNodesHtml = (state.nodes.metadata?.externalNodes || []).map(node => {
    const active = Number(node.buildYear || 0) <= year;
    const isNew = Number(node.buildYear || 0) === year;
    const selected = state.selectedNode === node.name;
    const status = externalNodeStatus(node, year);
    return `<button class="map-node external-map-node is-${status.key} ${active ? '' : 'is-future'} ${isNew ? 'is-new' : ''} ${selected ? 'is-selected' : ''}" style="left:${node.x}%; top:${node.y}%;" data-node="${escapeAttr(node.name)}" title="${escapeAttr(`${node.name} - 外送节点 - ${node.buildYear || '—'} 投运；单节点容量未单独拆分`)}" type="button"><span class="node-label">${escapeHtml(node.name)}</span></button>`;
  }).join('');
  $('#gansuMap').innerHTML = `${mapBaseSvg(edgesHtml)}${nodesHtml}${externalNodesHtml}${renderExternalNodeConsole()}`;
  document.querySelectorAll('.map-node').forEach(button => {
    button.addEventListener('click', () => {
      state.selectedNode = button.dataset.node;
      renderMap();
      renderSelectedNode();
    });
  });
  $('#gansuMap .external-matrix-button')?.addEventListener('click', () => {
    state.externalNodeConsoleOpen = !state.externalNodeConsoleOpen;
    renderMap();
  });
  document.querySelectorAll('#gansuMap .external-node-row').forEach(row => {
    row.addEventListener('click', () => {
      state.selectedNode = row.dataset.externalNode;
      state.externalNodeConsoleOpen = true;
      renderMap();
      renderSelectedNode();
    });
  });
}

function renderSelectedNode() {
  if (!state.nodes || !state.selectedNode) return;
  const year = moduleYear('nodes');
  const externalNode = externalNodeByName(state.selectedNode);
  if (externalNode) {
    renderSelectedExternalNode(externalNode);
    return;
  }
  const node = state.nodes.nodes.find(n => n.name === state.selectedNode && !isExternalCluster(n))
    || state.nodes.nodes.find(n => !isExternalCluster(n))
    || state.nodes.nodes[0];
  state.selectedNode = node.name;
  const yearData = state.nodes.yearly[String(year)]?.nodes[node.name] || { total: 0, categories: {} };
  $('#selectedNodeMeta').textContent = `${node.region || '—'} · ${node.type || '—'}`;
  const catRows = state.nodes.categories.map(cat => {
    const value = yearData.categories?.[cat.key] || 0;
    const pct = yearData.total ? value / yearData.total * 100 : 0;
    return `<div class="share-row"><div class="share-label">${cat.label}</div><div class="share-track"><div class="share-fill" style="width:${pct}%; background:${cat.color}"></div></div><div class="share-value">${fmt(value,0)} MW</div></div>`;
  }).join('');
  $('#selectedNode').innerHTML = `
    <h3>${node.name}</h3>
    <p>投建年份：${node.buildYear}；所属区域：${node.region || '—'}；节点类型：${node.type || '—'}。</p>
    <div class="node-stat-grid">
      <div class="node-stat"><span>${year} 节点容量</span><strong>${fmt(yearData.total,0)} MW</strong></div>
      <div class="node-stat"><span>投运状态</span><strong>${node.buildYear <= year ? (node.buildYear === year ? '当年投建' : '已投建') : '未投建'}</strong></div>
    </div>
    <div class="node-bars">${catRows}</div>
  `;
  renderNodeTrend(node.name);
}

function renderSelectedExternalNode(node) {
  const year = moduleYear('nodes');
  const status = externalNodeStatus(node, year);
  state.selectedNode = node.name;
  $('#selectedNodeMeta').textContent = `外送节点 · ${node.buildYear || '—'} 投运`;
  $('#selectedNode').innerHTML = `
    <h3>${escapeHtml(node.name)}</h3>
    <p>投运年份：${node.buildYear || '—'}；节点类型：外送节点；关联省内节点：${escapeHtml(node.linkedInternalNode || '—')}。</p>
    <div class="node-stat-grid external-stat-grid">
      <div class="node-stat"><span>容量口径</span><strong>未单独拆分</strong></div>
      <div class="node-stat"><span>投运状态</span><strong>${escapeHtml(status.label)}</strong></div>
      <div class="node-stat"><span>关联省内节点</span><strong>${escapeHtml(node.linkedInternalNode || '—')}</strong></div>
      <div class="node-stat"><span>所属口径</span><strong>外送节点集群</strong></div>
    </div>
    <p class="external-capacity-note">该节点属于外送节点集合。现有分配结果仅给出“外送节点集群”的聚合容量口径，尚未形成单个外送节点层面的容量拆分结果，因此本节点不展示独立 MW 容量。外送相关容量分析应以“外送节点集群”的聚合容量为准。</p>
  `;
  $('#nodeCapacityChart').innerHTML = `
    <div class="node-empty-chart">
      <strong>暂无单节点容量曲线</strong>
      <span>分配结果未下沉至单个外送节点。图中橙色虚线仅表示基于节点相对坐标与空间邻近关系形成的外送接入示意。</span>
    </div>
  `;
}

function renderNodeTrend(nodeName) {
  const currentYear = moduleYear('nodes');
  const cats = state.nodes.categories;
  const years = state.nodes.years;
  const totals = years.map(year => state.nodes.yearly[String(year)]?.nodes[nodeName]?.total || 0);
  const max = Math.max(...totals, 1);
  const width = 360, height = 185, pad = { left: 38, right: 10, top: 16, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (i / (years.length - 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / max) * plotH;
  const area = totals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ') + ` L ${pad.left + plotW} ${pad.top + plotH} L ${pad.left} ${pad.top + plotH} Z`;
  const line = totals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const currentIndex = years.indexOf(currentYear);
  $('#nodeCapacityChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${nodeName}容量趋势">
    <line class="grid-line" x1="${pad.left}" x2="${width-pad.right}" y1="${pad.top+plotH}" y2="${pad.top+plotH}"/>
    <path d="${area}" fill="rgba(201,154,46,.18)"/>
    <path d="${line}" fill="none" stroke="#c99a2e" stroke-width="3" stroke-linecap="round"/>
    <line class="current-year-line" x1="${x(currentIndex)}" x2="${x(currentIndex)}" y1="${pad.top}" y2="${pad.top+plotH}"/>
    <text class="axis-label" x="${pad.left}" y="${height-6}">${years[0]}</text>
    <text class="axis-label" x="${width-pad.right}" y="${height-6}" text-anchor="end">${years[years.length-1]}</text>
    <text class="axis-label" x="${pad.left}" y="12">${fmt(max,0)} MW</text>
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════════════
//  New chart renderers for sub-tab sections
// ═══════════════════════════════════════════════════════════════════════

function renderSingleLineChart(containerId, { getData, unit, color, label, digits = 1, fixedMin, fixedMax, tickStep }) {
  const container = $(`#${containerId}`);
  if (!container || !state.summary) return;
  const rows = state.summary.records;
  const year = moduleYear('province');
  const values = rows.map(r => Number(getData(r) || 0));
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);
  const minValue = Number.isFinite(fixedMin) ? fixedMin : (rawMin >= 0 ? 0 : rawMin - (rawMax - rawMin) * 0.08);
  const maxValue = Number.isFinite(fixedMax) ? fixedMax : rawMax + (rawMax - (rawMin >= 0 ? 0 : rawMin)) * 0.12;
  const minYear = rows[0].year, maxYear = rows[rows.length - 1].year;
  const width = 720, height = 430, pad = { left: 94, right: 24, top: 56, bottom: 48 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const ticks = chartTicks(minValue, maxValue, Number.isFinite(fixedMax) ? maxValue : rawMax, { tickStep });
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const x = yv => pad.left + ((yv - minYear) / (maxYear - minYear)) * plotW;
  const y = v => pad.top + plotH - ((Number(v || 0) - axis.min) / (axis.max - axis.min || 1)) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 10}" y="${yy + 4}" text-anchor="end">${fmt(tick, digits)}</text>`;
  }).join('');

  const points = [];
  const d = rows.map((row, i) => {
    const v = Number(getData(row) || 0);
    const px = x(row.year).toFixed(1), py = y(v).toFixed(1);
    const current = row.year === year;
    const title = `${row.year} · ${label} · ${fmt(v, digits)} ${unit}`;
    points.push(`<circle class="chart-point scenario-point ${current ? 'is-current is-selected' : ''}" data-chart="${containerId}" data-series="single" data-year="${row.year}" cx="${px}" cy="${py}" r="${current ? 5.4 : 3.8}" fill="${color}"><title>${escapeHtml(title)}</title></circle>`);
    return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
  }).join(' ');

  const yearTicks = [minYear, 2030, 2040, 2050, maxYear].filter((t, i, a) => a.indexOf(t) === i)
    .map(ty => `<text class="axis-label" x="${x(ty)}" y="${height - 20}" text-anchor="middle">${ty}</text>`).join('');

  const legend = `<g class="chart-legend-item scenario-legend-item" transform="translate(${(width - 180) / 2}, 20)">
    <line x1="0" x2="20" y1="0" y2="0" stroke="${color}" stroke-width="3.2" stroke-linecap="round"></line>
    <circle cx="10" cy="0" r="4.2" fill="${color}"></circle>
    <text class="axis-label scenario-legend-text" x="27" y="4">${label}</text>
  </g>`;

  const detailPanel = (() => {
    const row = rows.find(r => r.year === year);
    if (!row) return '';
    const v = Number(getData(row) || 0);
    return renderScenarioDetailPanel({ title: label, year, items: [{ key: 'single', label, value: `${fmt(v, digits)} ${unit}`, color, pointY: y(v) }] });
  })();

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 4}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="30" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 30 ${pad.top + plotH / 2})">${unit}</text>
    ${legend} ${grid}
    <line class="current-year-line" x1="${x(year)}" y1="${pad.top}" x2="${x(year)}" y2="${pad.top + plotH}"/>
    <path class="scenario-line" d="${d}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.join('')} ${yearTicks}
  </svg>${detailPanel}`;

  container.querySelectorAll('.scenario-point[data-chart]').forEach(target => {
    const activate = () => {
      if (target.dataset.year) {
        setModuleYear('province', target.dataset.year);
        syncYearInputs();
        renderAll();
      }
    };
    target.addEventListener('mouseenter', activate);
    target.addEventListener('click', activate);
  });
}

function renderOverviewSection() {
  document.querySelectorAll('.sub-tab-content .legend-panel').forEach(p => { if (p) p.innerHTML = ''; });

  renderMultiSeriesLine('overviewCapacityChart', [
    { key: 'withoutStorage', label: '总装机（不含储能）', color: '#c99a2e', get: row => capacityWanKw((row.capacity.withoutStorage || row.capacity).total || 0) },
    { key: 'withStorage', label: '总装机（含储能）', color: '#155eef', get: row => capacityWanKw((row.capacity.withStorage || row.capacity).total || 0) },
  ], '万千瓦', 700, 400);
  renderSingleLineChart('overviewGenerationChart', {
    getData: row => row.generation?.total || 0,
    unit: '亿千瓦时', color: '#18a389', label: '总发电量', digits: 0,
  });
  renderSingleLineChart('overviewEmissionChart', {
    getData: row => row.emission?.netEmission || 0,
    unit: '亿吨', color: '#f04e2f', label: '发电净排放量', digits: 2, tickStep: 0.5,
  });
  renderSingleLineChart('overviewCostChart', {
    getData: row => row.costByItem?.total || row.costBySource?.total || 0,
    unit: '亿元', color: '#c99a2e', label: '总发电成本', digits: 0,
  });
}

function renderExportCharts() {
  renderMultiSeriesLine('exportChart', [
    { key: 'gansu', label: '甘肃省外送电量', color: '#155eef', get: row => row.export?.gansu || 0 },
    { key: 'northwest', label: '西北地区外送电量', color: '#18a389', get: row => row.export?.northwest || 0 },
  ], '亿千瓦时', 700, 400);
  renderSingleLineChart('exportShareChart', {
    getData: row => row.export?.share || 0,
    unit: '%', color: '#18a389', label: '甘肃占西北外送比例', digits: 1, fixedMin: 0, fixedMax: 50, tickStep: 10,
  });
  renderSingleLineChart('exportChannelChart', {
    getData: row => row.export?.channels || 0,
    unit: '条', color: '#d8a21d', label: '已建设外送通道', digits: 0, fixedMin: 0, fixedMax: 10, tickStep: 2,
  });
}

function renderHoursChart() {
  const colorAll = '#2878b8', colorCoal = '#8f5a2a';
  const container = $('#hoursChart');
  if (!container || !state.summary) return;
  const rows = state.summary.records;
  const year = moduleYear('province');
  const values = rows.flatMap(r => [r.hours?.all || 0, r.hours?.coal || 0]);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);
  const span = rawMax - rawMin || 1;
  const minValue = rawMin >= 0 ? 0 : rawMin - span * 0.08;
  const maxValue = rawMax + span * 0.12;
  const minYear = rows[0].year, maxYear = rows[rows.length - 1].year;
  const width = 880, height = 430, pad = { left: 78, right: 30, top: 54, bottom: 48 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const ticks = niceTicks(minValue, maxValue);
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const x = yv => pad.left + ((yv - minYear) / (maxYear - minYear)) * plotW;
  const y = v => pad.top + plotH - ((Number(v || 0) - axis.min) / (axis.max - axis.min || 1)) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${fmt(tick, 0)}</text>`;
  }).join('');

  const series = [
    { key: 'all', label: '所有发电设备', color: colorAll, get: r => r.hours?.all || 0 },
    { key: 'coal', label: '煤电', color: colorCoal, get: r => r.hours?.coal || 0 },
  ];

  const legend = series.map((s, i) => `<g class="chart-legend-item" transform="translate(${(width - 340) / 2 + i * 170}, 20)">
    <line x1="0" x2="20" y1="0" y2="0" stroke="${s.color}" stroke-width="3.2" stroke-linecap="round"></line>
    <circle cx="10" cy="0" r="4.2" fill="${s.color}"></circle>
    <text class="axis-label economics-legend-text" x="27" y="4">${s.label}</text>
  </g>`).join('');

  const elements = series.map(s => {
    const points = [];
    const d = rows.map((row, i) => {
      const v = Number(s.get(row) || 0);
      const px = x(row.year).toFixed(1), py = y(v).toFixed(1);
      const current = row.year === year;
      points.push(`<circle class="economics-point province-point ${current ? 'is-current is-selected' : ''}" data-year="${row.year}" cx="${px}" cy="${py}" r="${current ? 5.4 : 3.8}" fill="${s.color}"><title>${row.year} · ${s.label} · ${fmt(v, 0)} h</title></circle>`);
      return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
    }).join(' ');
    return `<path class="economics-line province-line" d="${d}" fill="none" stroke="${s.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>${points.join('')}`;
  }).join('');

  const yearTicks = [minYear, 2030, 2040, 2050, maxYear].filter((t, i, a) => a.indexOf(t) === i)
    .map(ty => `<text class="axis-label" x="${x(ty)}" y="${height - 20}" text-anchor="middle">${ty}</text>`).join('');

  const badges = series.map((s, i) => {
    const cv = Number(s.get(rows.find(r => r.year === year) || rows[0]) || 0);
    const badgeY = pad.top + 22 + i * 26;
    return `<text class="economics-badge province-badge" style="fill:${s.color}" x="${Math.min(Math.max(x(year), pad.left + 180), width - pad.right - 180)}" y="${badgeY}" text-anchor="middle">${year} · ${s.label} · ${fmt(cv, 0)} h</text>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 4}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="28" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 28 ${pad.top + plotH / 2})">h</text>
    ${legend} ${grid}
    <line class="current-year-line" x1="${x(year)}" y1="${pad.top}" x2="${x(year)}" y2="${pad.top + plotH}"/>
    ${elements} ${badges} ${yearTicks}
  </svg>`;

  container.querySelectorAll('.province-point').forEach(point => {
    point.addEventListener('click', () => {
      setModuleYear('province', point.dataset.year);
      syncYearInputs();
      renderAll();
    });
  });
}

function renderCleanCharts() {
  const colorNonFossilGen = '#18a389', colorNonHydroRenewGen = '#08d5c5';
  const colorNonFossilCap = '#155eef', colorNonHydroRenewCap = '#d8a21d';
  const year = moduleYear('province');
  const rows = state.summary.records;

  // Clean chart - 4 lines
  const cleanSeries = [
    { key: 'nonFossilGen', label: '非化石能源发电量占比', color: colorNonFossilGen, get: r => r.clean?.nonFossilGeneration || 0 },
    { key: 'nonHydroRenewGen', label: '非水可再生能源发电量占比', color: colorNonHydroRenewGen, get: r => r.clean?.nonHydroRenewableGeneration || 0 },
    { key: 'nonFossilCap', label: '非化石能源装机占比', color: colorNonFossilCap, get: r => r.clean?.nonFossilCapacity || 0 },
    { key: 'nonHydroRenewCap', label: '非水可再生能源装机占比', color: colorNonHydroRenewCap, get: r => r.clean?.nonHydroRenewableCapacity || 0 },
  ];
  renderMultiSeriesLine('cleanChart', cleanSeries, '%', 700, 400);

  // Emission chart - 3 lines (total, captured, net)
  const emissionSeries = [
    { key: 'total', label: '发电总碳排放量', color: '#d66a2d', get: r => r.emission?.totalEmission || 0 },
    { key: 'captured', label: '发电碳捕集量', color: '#08d5c5', get: r => r.emission?.capturedEmission || 0 },
    { key: 'net', label: '发电净排放量', color: '#f04e2f', get: r => r.emission?.netEmission || 0 },
  ];
  renderMultiSeriesLine('emissionChart', emissionSeries, '亿吨', 700, 400, 1, {
    fixedMin: 0,
    fixedMax: 1.6,
    tickStep: 0.4,
  });

  // Unit emission - single line
  renderSingleLineChart('unitEmissionChart', {
    getData: row => row.emission?.unitEmission || 0,
    unit: '克/千瓦时', color: '#155eef', label: '单位发电量碳排放', digits: 0,
  });
}

function renderMultiSeriesLine(containerId, series, unit, width = 700, height = 400, gridDigits, options = {}) {
  const container = $(`#${containerId}`);
  if (!container || !state.summary) return;
  if (width === 700 && height === 400) {
    width = 720;
    height = 430;
  }
  const rows = state.summary.records;
  const year = moduleYear('province');
  const readValue = (seriesItem, row) => {
    const value = Number(seriesItem.get(row));
    return Number.isFinite(value) ? value : null;
  };
  const values = rows
    .flatMap(r => series.map(s => readValue(s, r)))
    .filter(value => value != null);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);
  const minValue = Number.isFinite(options.fixedMin)
    ? options.fixedMin
    : (rawMin >= 0 ? 0 : rawMin - (rawMax - rawMin) * 0.08);
  const maxValue = Number.isFinite(options.fixedMax)
    ? options.fixedMax
    : rawMax + (rawMax - (rawMin >= 0 ? 0 : rawMin)) * 0.12;
  const minYear = rows[0].year, maxYear = rows[rows.length - 1].year;
  const pad = { left: 94, right: 24, top: 56, bottom: 48 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const ticks = chartTicks(minValue, maxValue, rawMax, { tickStep: options.tickStep });
  const axis = axisBoundsFromTicks(ticks, minValue, maxValue);
  const x = yv => pad.left + ((yv - minYear) / (maxYear - minYear)) * plotW;
  const y = v => pad.top + plotH - ((Number(v || 0) - axis.min) / (axis.max - axis.min || 1)) * plotH;
  const grid = ticks.map(tick => {
    const yy = y(tick);
    return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text class="axis-label" x="${pad.left - 10}" y="${yy + 4}" text-anchor="end">${gridDigits != null ? fmt(tick, gridDigits) : fmt(tick)}</text>`;
  }).join('');

  const legend = series.map((s, i) => {
    const cols = Math.min(series.length, 3);
    const slot = 190;
    const lw = cols * slot;
    const ls = (width - lw) / 2;
    return `<g class="chart-legend-item scenario-legend-item" transform="translate(${ls + (i % 3) * slot}, ${18 + Math.floor(i / 3) * 18})">
      <line x1="0" x2="20" y1="0" y2="0" stroke="${s.color}" stroke-width="3.2" stroke-linecap="round"></line>
      <circle cx="10" cy="0" r="4.2" fill="${s.color}"></circle>
      <text class="axis-label scenario-legend-text" x="27" y="4">${s.label}</text>
    </g>`;
  }).join('');

  const elements = series.map(s => {
    const pts = [];
    const drawableRows = rows
      .map(row => ({ row, value: readValue(s, row) }))
      .filter(item => item.value != null);
    if (!drawableRows.length) return '';
    const d = drawableRows.map((item, i) => {
      const { row, value: v } = item;
      const px = x(row.year).toFixed(1), py = y(v).toFixed(1);
      const current = row.year === year;
      pts.push(`<circle class="chart-point scenario-point ${current ? 'is-current is-selected' : ''}" data-chart="${containerId}" data-series="${s.key}" data-year="${row.year}" cx="${px}" cy="${py}" r="${current ? 5.4 : 3.8}" fill="${s.color}"><title>${escapeHtml(row.year + ' · ' + s.label + ' · ' + fmt(v, 2) + ' ' + unit)}</title></circle>`);
      return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
    }).join(' ');
    return `<path class="scenario-line" d="${d}" fill="none" stroke="${s.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>${pts.join('')}`;
  }).join('');

  const yearTicks = [minYear, 2030, 2040, 2050, maxYear].filter((t, i, a) => a.indexOf(t) === i)
    .map(ty => `<text class="axis-label" x="${x(ty)}" y="${height - 20}" text-anchor="middle">${ty}</text>`).join('');

  const detailPanel = (() => {
    const row = rows.find(r => r.year === year);
    if (!row) return '';
    const items = series.map(s => ({
      key: s.key,
      label: s.label,
      value: readValue(s, row) == null ? '—' : `${fmt(readValue(s, row), 2)} ${unit}`,
      color: s.color,
      pointY: readValue(s, row) == null ? null : y(readValue(s, row)),
    }));
    return renderScenarioDetailPanel({ title: PROVINCE_CHART_TITLES[containerId] || containerId, year, items });
  })();

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}">
    <text class="axis-label axis-label--x" x="${pad.left + plotW / 2}" y="${height - 4}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="30" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 30 ${pad.top + plotH / 2})">${unit}</text>
    ${legend} ${grid}
    <line class="current-year-line" x1="${x(year)}" y1="${pad.top}" x2="${x(year)}" y2="${pad.top + plotH}"/>
    ${elements} ${yearTicks}
  </svg>${detailPanel}`;

  container.querySelectorAll('.scenario-point[data-chart]').forEach(target => {
    const activate = () => {
      if (target.dataset.year) {
        setModuleYear('province', target.dataset.year);
        syncYearInputs();
        renderAll();
      }
    };
    target.addEventListener('mouseenter', activate);
    target.addEventListener('click', activate);
  });
}

function levelizedCostBySource(record, key) {
  const cost = Number(record.costBySource?.[key]);
  const generation = Number(record.generation?.[key]);
  if (!Number.isFinite(cost) || !Number.isFinite(generation) || generation <= 0) return null;
  return cost / generation * 1000;
}

function renderCostCharts() {
  const year = moduleYear('province');
  const rows = state.summary.records;

  // Cost by source - 6 power types + total
  const sourceSeries = [
    { key: 'coal', label: '煤电', color: '#8f5a2a', get: r => r.costBySource?.coal || 0 },
    { key: 'hydro', label: '水电', color: '#2878b8', get: r => r.costBySource?.hydro || 0 },
    { key: 'wind', label: '陆上风电', color: '#18a389', get: r => r.costBySource?.wind || 0 },
    { key: 'pv', label: '光伏', color: '#d8a21d', get: r => r.costBySource?.pv || 0 },
    { key: 'csp', label: '光热', color: '#d7662b', get: r => r.costBySource?.csp || 0 },
    { key: 'other', label: '其他', color: '#756b91', get: r => r.costBySource?.other || 0 },
    { key: 'total', label: '总成本', color: '#111d32', get: r => r.costBySource?.total || 0 },
  ];
  renderMultiSeriesLine('costSourceChart', sourceSeries, '亿元', 700, 400, 0);

  // Levelized cost by source - source cost / source generation
  const levelizedSourceSeries = [
    { key: 'coal', label: '煤电', color: '#8f5a2a', get: r => levelizedCostBySource(r, 'coal') },
    { key: 'hydro', label: '水电', color: '#2878b8', get: r => levelizedCostBySource(r, 'hydro') },
    { key: 'wind', label: '陆上风电', color: '#18a389', get: r => levelizedCostBySource(r, 'wind') },
    { key: 'pv', label: '光伏', color: '#d8a21d', get: r => levelizedCostBySource(r, 'pv') },
    { key: 'csp', label: '光热', color: '#d7662b', get: r => levelizedCostBySource(r, 'csp') },
    { key: 'other', label: '其他', color: '#756b91', get: r => levelizedCostBySource(r, 'other') },
    { key: 'total', label: '综合度电成本', color: '#111d32', get: r => levelizedCostBySource(r, 'total') },
  ];
  renderMultiSeriesLine('levelizedCostSourceChart', levelizedSourceSeries, '元/MWh', 700, 400, 2);

  // Cost by item - 6 cost items + total
  const itemSeries = [
    { key: 'operation', label: '发电运维', color: '#155eef', get: r => r.costByItem?.operation || 0 },
    { key: 'fuel', label: '发电燃料', color: '#8f5a2a', get: r => r.costByItem?.fuel || 0 },
    { key: 'depreciation', label: '发电折旧', color: '#2878b8', get: r => r.costByItem?.depreciation || 0 },
    { key: 'finance', label: '发电财务', color: '#756b91', get: r => r.costByItem?.finance || 0 },
    { key: 'ccus', label: 'CCUS成本', color: '#f04e2f', get: r => r.costByItem?.ccus || 0 },
    { key: 'emission', label: '排放成本', color: '#d66a2d', get: r => r.costByItem?.emission || 0 },
    { key: 'total', label: '总成本', color: '#111d32', get: r => r.costByItem?.total || 0 },
  ];
  renderMultiSeriesLine('costItemChart', itemSeries, '亿元', 700, 400, 0);

  // Cost structure bar chart for current year
  renderCostStructureBar();
}

function renderCostStructureBar() {
  const container = $('#costStructureChart');
  if (!container || !state.summary) return;
  const year = moduleYear('province');
  const r = state.summary.records.find(rec => rec.year === year);
  if (!r || !r.costByItem) return;

  const items = [
    { key: 'operation', label: '发电运维', color: '#155eef' },
    { key: 'fuel', label: '发电燃料', color: '#8f5a2a' },
    { key: 'depreciation', label: '发电折旧', color: '#2878b8' },
    { key: 'finance', label: '发电财务', color: '#756b91' },
    { key: 'ccus', label: 'CCUS成本', color: '#f04e2f' },
    { key: 'emission', label: '排放成本', color: '#d66a2d' },
  ];

  const total = r.costByItem.total || 0;
  const maxVal = Math.max(...items.map(item => Math.abs(r.costByItem[item.key] || 0)), 1);

  const rows = items.map(item => {
    const val = r.costByItem[item.key] || 0;
    const pct = total ? (val / total * 100) : 0;
    const barW = Math.min(100, Math.abs(val) / maxVal * 100);
    return `<div class="cost-bar-row ${val < 0 ? 'is-negative' : ''}">
      <div class="cost-bar-label">${item.label}</div>
      <div class="cost-bar-track"><div class="cost-bar-fill" style="width:${barW}%; background:${item.color}"></div></div>
      <div class="cost-bar-value">${fmt(val, 0)} 亿元</div>
      <div class="cost-bar-share">${fmt(pct, 1)}%</div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="text-align:center;margin-bottom:16px;font-size:18px;font-weight:850;color:var(--ink);">
      ${year} 年发电成本结构 · 总成本 ${fmt(total, 0)} 亿元
    </div>
    <div style="display:grid;grid-template-columns:100px minmax(80px,1fr) 100px 60px;gap:14px;margin-bottom:8px;padding:0 4px;">
      <span style="color:var(--muted);font-size:13px;font-weight:800;text-align:right;">成本项</span>
      <span style="color:var(--muted);font-size:13px;font-weight:800;">占比</span>
      <span style="color:var(--muted);font-size:13px;font-weight:800;text-align:right;">金额</span>
      <span style="color:var(--muted);font-size:13px;font-weight:800;text-align:right;">占比%</span>
    </div>
    ${rows}
  `;
}

function regionalAreas() {
  return state.regions?.areas || [
    { key: 'gansu', label: '甘肃省', shortLabel: '甘肃', color: '#c99a2e' },
    { key: 'northwest', label: '西北地区', shortLabel: '西北', color: '#18a389' },
    { key: 'national', label: '全国', shortLabel: '全国', color: '#155eef' },
  ];
}

function regionalAreaMeta(key) {
  return regionalAreas().find(area => area.key === key) || { key, label: key, shortLabel: key, color: '#155eef' };
}

function renderRegionalModule() {
  if (!state.regions) return;
  renderRegionalKpis();
  renderRegionalControls();
  renderRegionalStructureChart();
  renderRegionalCleanCharts();
  renderRegionalCleanRankPanel();
  renderRegionalCarbonChart();
  renderRegionalMatrix();
}

function renderRegionalKpis() {
  const container = $('#regionalKpiGrid');
  if (!container || !state.regions) return;
  const year = moduleYear('regions');
  const clean = getRegionalCleanRecord('nonFossil', year);
  const carbon = getRegionalCarbonRecord(year);
  const startCarbon = getRegionalCarbonRecord(state.regions.years?.[0] || 2024);
  if (!clean || !carbon) return;
  const genGap = clean.generationShare.gansu - clean.generationShare.national;
  const capGap = clean.capacityShare.gansu - clean.capacityShare.national;
  const carbonGap = carbon.intensityGramPerKwh.gansu - carbon.intensityGramPerKwh.national;
  const carbonDrop = startCarbon?.intensityGramPerKwh?.gansu
    ? (carbon.intensityGramPerKwh.gansu - startCarbon.intensityGramPerKwh.gansu) / startCarbon.intensityGramPerKwh.gansu * 100
    : 0;
  const status = genGap >= 0 && carbonGap <= 0 ? '清洁低碳双优势' : genGap >= 0 ? '清洁化领先' : '转型追赶中';
  container.innerHTML = [
    { label: '甘肃非化石发电占比', value: `${fmt(clean.generationShare.gansu, 1)}%`, note: `较全国 ${genGap >= 0 ? '+' : ''}${fmt(genGap, 1)} 个百分点` },
    { label: '甘肃非化石装机占比', value: `${fmt(clean.capacityShare.gansu, 1)}%`, note: `较全国 ${capGap >= 0 ? '+' : ''}${fmt(capGap, 1)} 个百分点` },
    { label: '甘肃碳排放强度', value: `${fmt(carbon.intensityGramPerKwh.gansu, 1)}`, note: `克/千瓦时，较2024 ${fmt(carbonDrop, 1)}%` },
    { label: '区域相对判断', value: status, note: `碳强度较全国 ${carbonGap <= 0 ? '' : '+'}${fmt(carbonGap, 1)} g/kWh` },
  ].map(item => `
    <article class="kpi regional-kpi">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      <em>${item.note}</em>
    </article>
  `).join('');
}

function renderRegionalControls() {
  const yearBox = $('#regionalStructureYearControls');
  const metricBox = $('#regionalStructureMetricControls');
  const cleanBox = $('#regionalCleanMetricControls');
  if (yearBox) {
    yearBox.innerHTML = ['2030', '2060'].map(year => `<button class="regional-segment__button ${state.selectedRegionalStructureYear === year ? 'is-active' : ''}" data-regional-structure-year="${year}" type="button">${year}</button>`).join('');
    yearBox.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      state.selectedRegionalStructureYear = button.dataset.regionalStructureYear;
      renderAll();
    }));
  }
  if (metricBox) {
    metricBox.innerHTML = REGIONAL_STRUCTURE_METRICS.map(item => `<button class="regional-segment__button ${state.selectedRegionalStructureMetric === item.key ? 'is-active' : ''}" data-regional-structure-metric="${item.key}" type="button">${item.label}</button>`).join('');
    metricBox.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      state.selectedRegionalStructureMetric = button.dataset.regionalStructureMetric;
      renderAll();
    }));
  }
  if (cleanBox) {
    cleanBox.innerHTML = REGIONAL_CLEAN_METRICS.map(item => `<button class="regional-segment__button ${state.selectedRegionalCleanMetric === item.key ? 'is-active' : ''}" data-regional-clean-metric="${item.key}" type="button">${item.label}</button>`).join('');
    cleanBox.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      state.selectedRegionalCleanMetric = button.dataset.regionalCleanMetric;
      renderAll();
    }));
  }
}

function renderRegionalStructureChart() {
  const container = $('#regionalStructureChart');
  if (!container || !state.regions) return;
  const year = state.selectedRegionalStructureYear;
  const metric = state.selectedRegionalStructureMetric;
  const block = state.regions.structure?.[year]?.[metric];
  if (!block) {
    container.innerHTML = '<div class="empty-chart">暂无区域结构对比数据。</div>';
    return;
  }
  const legend = block.categories.map(cat => `<span class="regional-legend-item"><i style="background:${cat.color}"></i>${escapeHtml(cat.label)}</span>`).join('');
  const rows = block.regions.map(region => {
    const allCats = block.categories
      .map(cat => ({ ...cat, value: Number(region.values?.[cat.key] || 0) }))
      .filter(item => item.value > 0.01);
    // 计算每个电源在堆叠条中的累积位置
    let cumPos = 0;
    const catsWithPos = allCats.map(cat => {
      const left = cumPos;
      cumPos += cat.value;
      return { ...cat, leftPct: left };
    });
    const segments = catsWithPos.map(cat => {
      const isSmall = cat.value < 5;
      const showText = isSmall ? '' : `${cat.label} ${fmt(cat.value, 0)}%`;
      return `<span class="regional-stack-segment ${isSmall ? 'regional-stack-segment--small' : ''}" style="width:${Math.max(cat.value, 0.5)}%;background:${cat.color}" title="${escapeAttr(`${region.label} ${cat.label} ${fmt(cat.value, 2)}%`)}">${showText}</span>`;
    }).join('');
    const smallCats = catsWithPos.filter(cat => cat.value < 5);
    const annotations = smallCats.length
      ? (() => {
        const N = smallCats.length;
        const BAR_W = 1000;
        // 标签在底部均匀分布，返回百分比值
        const labelPct = i => (i + 1) / (N + 1) * 100;
        // 电源色块中心在堆叠条中的百分比位置
        const segPct = c => c.leftPct + c.value / 2;
        // SVG 坐标 = 百分比 × 10（viewBox 0-1000）
        const toSvg = pct => Math.round(pct * 10);
        const connectorD = smallCats.map((c, i) => {
          const lx = toSvg(labelPct(i));
          const sx = toSvg(segPct(c));
          return `<polyline points="${lx},54 ${lx},26 ${sx},26 ${sx},14" fill="none" stroke="#6f7480" stroke-width="1.2" stroke-linejoin="round" />`;
        }).join('');
        const arrowHeads = smallCats.map(c => {
          const sx = toSvg(segPct(c));
          return `<polygon points="${sx},6 ${sx - 4},14 ${sx + 4},14" fill="#6f7480" />`;
        }).join('');
        const labelHTML = smallCats.map((c, i) => {
          const lx = labelPct(i);
          return `<span class="regional-stack-annotation__label" style="left:${lx}%">${c.label} ${fmt(c.value, 1)}%</span>`;
        }).join('');
        return `<div class="regional-stack-annotation">
          <svg viewBox="0 0 ${BAR_W} 78" preserveAspectRatio="none" style="display:block;width:100%;height:100%;overflow:visible">${connectorD}${arrowHeads}</svg>
          ${labelHTML}
        </div>`;
      })()
      : '';
    return `
      <div class="regional-stack-row">
        <div class="regional-stack-label">
          <strong>${escapeHtml(region.label)}</strong>
        </div>
        <div class="regional-stack-bar">${segments}</div>
        ${annotations}
      </div>
    `;
  }).join('');
  container.innerHTML = `
    <div class="regional-structure-head">
      <strong>${year}年 · ${REGIONAL_STRUCTURE_METRICS.find(item => item.key === metric)?.label || ''}</strong>
    </div>
    <div class="regional-stack-list">${rows}</div>
    <div class="regional-legend">${legend}</div>
  `;
}

function regionalLineScales(records, getter, width, height, pad, fixedMax) {
  const years = records.map(record => record.year);
  const values = records.flatMap(record => regionalAreas().map(area => Number(getter(record, area.key) || 0)));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const maxValue = fixedMax ?? Math.max(...values, 1);
  const minValue = Math.min(0, ...values);
  const yTicks = niceTicks(minValue, maxValue);
  const axis = axisBoundsFromTicks(yTicks, minValue, maxValue);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = year => pad.left + ((year - minYear) / Math.max(maxYear - minYear, 1)) * plotW;
  const y = value => pad.top + (1 - (value - axis.min) / Math.max(axis.max - axis.min, 1)) * plotH;
  return { minYear, maxYear, minValue: axis.min, maxValue: axis.max, yTicks, plotW, plotH, x, y };
}

function renderRegionalLineChart(containerId, records, getter, options = {}) {
  const container = $(`#${containerId}`);
  if (!container || !records?.length) return;
  const year = moduleYear('regions');
  const width = options.width || 760;
  const height = options.height || 360;
  const pad = { left: 76, right: 38, top: 58, bottom: 54 };
  const scale = regionalLineScales(records, getter, width, height, pad, options.fixedMax);
  const ticks = [scale.minYear, 2030, 2040, 2050, scale.maxYear].filter((v, i, arr) => arr.indexOf(v) === i && v >= scale.minYear && v <= scale.maxYear);
  const niceYTicks = scale.yTicks || niceTicks(scale.minValue, scale.maxValue);
  const grid = niceYTicks.map(tick =>
    `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${scale.y(tick)}" y2="${scale.y(tick)}"></line><text class="axis-label" x="${pad.left - 12}" y="${scale.y(tick) + 5}" text-anchor="end">${fmt(tick, 0)}</text>`
  ).join('');
  const xLabels = ticks.map(tick => `<text class="axis-label" x="${scale.x(tick)}" y="${height - 22}" text-anchor="middle">${tick}</text>`).join('');
  const guideX = scale.x(year);
  const series = regionalAreas().map(area => {
    const d = records.map((record, i) => {
      const px = scale.x(record.year);
      const py = scale.y(getter(record, area.key));
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join(' ');
    const circles = records.map(record => {
      const current = record.year === year;
      const value = getter(record, area.key);
      return `<circle class="chart-point scenario-point ${current ? 'is-current is-selected' : ''}" data-chart="${containerId}" data-series="${area.key}" data-year="${record.year}" cx="${scale.x(record.year)}" cy="${scale.y(value)}" r="${current ? 6.4 : 4.2}" fill="${area.color}"><title>${record.year} ${area.label} ${fmt(value, options.digits ?? 1)}${options.unit || ''}</title></circle>`;
    }).join('');
    return `<path class="scenario-line" d="${d}" fill="none" stroke="${area.color}" stroke-width="${area.key === 'gansu' ? 4.4 : 3.4}" stroke-linecap="round" stroke-linejoin="round"/>${circles}`;
  }).join('');
  const legend = regionalAreas().map((area, i) => `<g class="chart-legend-item scenario-legend-item" transform="translate(${pad.left + i * 180}, 24)"><line x1="0" x2="26" y1="0" y2="0" stroke="${area.color}" stroke-width="4" stroke-linecap="round"></line><circle cx="13" cy="0" r="5.2" fill="${area.color}"></circle><text class="axis-label scenario-legend-text" x="34" y="5">${area.label}</text></g>`).join('');

  const detailPanel = (() => {
    const row = records.find(record => record.year === year);
    if (!row) return '';
    const items = regionalAreas().map(area => ({
      key: area.key,
      label: area.label,
      value: `${fmt(getter(row, area.key), options.digits ?? 1)}${options.unit || ''}`,
      color: area.color,
      pointY: scale.y(getter(row, area.key)),
    }));
    return renderScenarioDetailPanel({ title: options.label || '区域趋势', year, items });
  })();

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(options.label || '区域趋势图')}">
    <text class="axis-label axis-label--x" x="${pad.left + scale.plotW / 2}" y="${height - 6}" text-anchor="middle">年份</text>
    <text class="axis-label axis-label--y" x="32" y="${pad.top + scale.plotH / 2}" text-anchor="middle" transform="rotate(-90 32 ${pad.top + scale.plotH / 2})">${options.unitLabel || ''}</text>
    ${legend}
    ${grid}
    <line class="current-year-line" x1="${guideX}" x2="${guideX}" y1="${pad.top}" y2="${height - pad.bottom}"></line>
    ${xLabels}
    ${series}
  </svg>${detailPanel}`;

  container.querySelectorAll('.scenario-point[data-chart]').forEach(target => {
    const activate = () => {
      if (target.dataset.year) {
        setModuleYear('regions', target.dataset.year);
        syncYearInputs();
        renderAll();
      }
    };
    target.addEventListener('mouseenter', activate);
    target.addEventListener('click', activate);
  });
}

function renderRegionalCleanCharts() {
  const metric = state.selectedRegionalCleanMetric;
  const data = state.regions?.clean?.[metric];
  if (!data?.records?.length) return;
  renderRegionalLineChart('regionalCleanGenerationChart', data.records, (record, key) => record.generationShare?.[key] || 0, {
    label: `${data.label}发电量占比趋势`,
    unit: '%',
    unitLabel: '%',
    fixedMax: 100,
    digits: 1,
    width: 880,
    height: 380,
  });
  renderRegionalLineChart('regionalCleanCapacityChart', data.records, (record, key) => record.capacityShare?.[key] || 0, {
    label: `${data.label}装机占比趋势`,
    unit: '%',
    unitLabel: '%',
    fixedMax: 100,
    digits: 1,
    width: 880,
    height: 380,
  });
}

function renderRegionalCleanRankPanel() {
  const container = $('#regionalCleanRankPanel');
  const metric = state.selectedRegionalCleanMetric;
  const data = state.regions?.clean?.[metric];
  const record = getRegionalCleanRecord(metric);
  if (!container || !data || !record) return;
  const rows = [
    { key: 'generationShare', label: '发电量占比' },
    { key: 'capacityShare', label: '装机占比' },
  ].map(type => {
    const ranking = regionalAreas()
      .map(area => ({ ...area, value: record[type.key]?.[area.key] || 0 }))
      .sort((a, b) => b.value - a.value);
    return `<section class="regional-rank-group">
      <h3>${escapeHtml(data.label)} · ${type.label}</h3>
      ${ranking.map((area, i) => `<div class="regional-rank-row">
        <span><b>${i + 1}</b>${escapeHtml(area.label)}</span>
        <strong style="color:${area.color}">${fmt(area.value, 1)}%</strong>
      </div>`).join('')}
    </section>`;
  }).join('');
  container.innerHTML = rows;
}

function renderRegionalCarbonChart() {
  const records = state.regions?.carbon || [];
  renderRegionalLineChart('regionalCarbonChart', records, (record, key) => record.intensityGramPerKwh?.[key] || 0, {
    label: '单位发电量碳排放强度趋势',
    unit: ' g/kWh',
    unitLabel: '克/千瓦时',
    digits: 1,
    width: 980,
    height: 460,
  });
}

function regionalDiffText(value, unit, lowerIsBetter = false) {
  const abs = fmt(Math.abs(value), 1);
  if (Math.abs(value) < 0.05) return `持平`;
  if (lowerIsBetter) return value <= 0 ? `低 ${abs}${unit}` : `高 ${abs}${unit}`;
  return value >= 0 ? `高 ${abs}${unit}` : `低 ${abs}${unit}`;
}

function renderRegionalMatrix() {
  const container = $('#regionalMatrix');
  if (!container || !state.regions) return;
  const year = moduleYear('regions');
  const nonFossil = getRegionalCleanRecord('nonFossil', year);
  const renewable = getRegionalCleanRecord('renewable', year);
  const nonHydro = getRegionalCleanRecord('nonHydroRenewable', year);
  const carbon = getRegionalCarbonRecord(year);
  if (!nonFossil || !carbon) return;
  const rows = [
    { name: '非化石发电占比', unit: '%', data: nonFossil.generationShare, lower: false },
    { name: '非化石装机占比', unit: '%', data: nonFossil.capacityShare, lower: false },
    { name: '可再生发电占比', unit: '%', data: renewable?.generationShare || {}, lower: false },
    { name: '非水可再生发电占比', unit: '%', data: nonHydro?.generationShare || {}, lower: false },
    { name: '单位发电量碳排放强度', unit: ' g/kWh', data: carbon.intensityGramPerKwh, lower: true },
  ];
  const tableRows = rows.map(row => {
    const diff = (row.data.gansu || 0) - (row.data.national || 0);
    const cls = Math.abs(diff) < 0.05 ? 'is-flat' : row.lower ? (diff <= 0 ? 'is-good' : 'is-warn') : (diff >= 0 ? 'is-good' : 'is-warn');
    return `<div class="regional-matrix-row">
      <span class="regional-matrix-name">${escapeHtml(row.name)}</span>
      <strong>${fmt(row.data.gansu, 1)}${row.unit}</strong>
      <strong>${fmt(row.data.northwest, 1)}${row.unit}</strong>
      <strong>${fmt(row.data.national, 1)}${row.unit}</strong>
      <em class="${cls}">${regionalDiffText(diff, row.unit === '%' ? ' 百分点' : row.unit, row.lower)}</em>
    </div>`;
  }).join('');
  container.innerHTML = `
    <div class="regional-matrix-table">
      <div class="regional-matrix-head">
        <span>指标</span><span>甘肃省</span><span>西北地区</span><span>全国</span><span>甘肃相对全国</span>
      </div>
      ${tableRows}
    </div>
  `;
}

initAuthGate();








