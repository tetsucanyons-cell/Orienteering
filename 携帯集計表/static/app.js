/* ==========================================================================
   携帯料金・通信費集計ダッシュボード フロントエンドロジック
   ========================================================================== */

// アプリケーションのグローバル状態
const state = {
    rawData: [],
    settings: { directories: [], keywords: [] },
    activeBase: 'billing', // 'billing' (請求月) or 'usage' (利用月)
    chartType: 'line',     // 'line' or 'bar'
    filters: {
        search: '',
        carrier: 'all',
        card: 'all',
        startMonth: 'all',
        endMonth: 'all'
    },
    sortColumn: 'usage_date',
    sortDirection: 'asc',
    charts: {
        trend: null,
        carrier: null,
        card: null
    }
};

// キャリア判定名マッピング
const CARRIER_NAMES = {
    'ドコモ': 'NTTドコモ',
    'ｕｑ': 'UQ mobile',
    'uq': 'UQ mobile',
    'ラクテンモバイル': '楽天モバイル',
    '楽天モバイル': '楽天モバイル',
    'ｉｉｊ': 'IIJmio',
    'iij': 'IIJmio',
    'ｐｏｖｏ': 'povo',
    'povo': 'povo'
};

function getDisplayCarrier(item) {
    const kw = item.matched_keyword ? item.matched_keyword.toLowerCase() : '';
    for (const [key, value] of Object.entries(CARRIER_NAMES)) {
        if (kw.includes(key)) return value;
    }
    // 店名そのものから推測
    const store = item.store.toLowerCase();
    if (store.includes('ドコモ') || store.includes('docomo')) return 'NTTドコモ';
    if (store.includes('uq')) return 'UQ mobile';
    if (store.includes('楽天モバイル') || store.includes('rakuten')) return '楽天モバイル';
    if (store.includes('iij')) return 'IIJmio';
    if (store.includes('povo')) return 'povo';
    return 'その他通信費';
}

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadAllData();
});

// イベントリスナーの登録
function initEventListeners() {
    // サイドバーのナビゲーション
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const target = item.getAttribute('data-target');
            switchView(target);
        });
    });

    // 請求基準トグル
    const toggleRadios = document.querySelectorAll('input[name="month-base"]');
    toggleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.activeBase = e.target.value;
            processData();
        });
    });

    // グラフタイプトグル
    const chartTypeBtns = document.querySelectorAll('.chart-type-btn');
    chartTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            chartTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.chartType = btn.getAttribute('data-type');
            renderTrendChart();
        });
    });

    // リロードボタン
    document.getElementById('reload-btn').addEventListener('click', () => {
        loadAllData(true);
    });

    // フィルター操作
    document.getElementById('filter-search').addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        renderFilteredTable();
    });
    document.getElementById('filter-carrier').addEventListener('change', (e) => {
        state.filters.carrier = e.target.value;
        renderFilteredTable();
    });
    document.getElementById('filter-card').addEventListener('change', (e) => {
        state.filters.card = e.target.value;
        renderFilteredTable();
    });
    document.getElementById('filter-start-month').addEventListener('change', (e) => {
        state.filters.startMonth = e.target.value;
        adjustEndMonthSelect();
        processData();
    });
    document.getElementById('filter-end-month').addEventListener('change', (e) => {
        state.filters.endMonth = e.target.value;
        adjustStartMonthSelect();
        processData();
    });


    // テーブルソート
    const headers = document.querySelectorAll('.data-table th[data-sort]');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const col = header.getAttribute('data-sort');
            if (state.sortColumn === col) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = col;
                state.sortDirection = 'asc';
            }
            
            // ソートアイコンの更新
            headers.forEach(h => {
                const icon = h.querySelector('i');
                icon.className = 'fa-solid fa-sort';
            });
            const currentIcon = header.querySelector('i');
            currentIcon.className = state.sortDirection === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';

            renderFilteredTable();
        });
    });

    // 設定画面の操作
    document.getElementById('add-keyword-btn').addEventListener('click', addKeyword);
    document.getElementById('new-keyword-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword();
    });
    document.getElementById('add-dir-btn').addEventListener('click', addDirectory);
    document.getElementById('new-dir-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDirectory();
    });
    document.getElementById('save-settings-btn').addEventListener('click', saveSettingsToServer);
}

// 開始月・終了月選択の自動調整
function adjustEndMonthSelect() {
    const start = document.getElementById('filter-start-month').value;
    const endSelect = document.getElementById('filter-end-month');
    if (start !== 'all' && endSelect.value !== 'all' && endSelect.value < start) {
        endSelect.value = start;
        state.filters.endMonth = start;
    }
}

function adjustStartMonthSelect() {
    const end = document.getElementById('filter-end-month').value;
    const startSelect = document.getElementById('filter-start-month');
    if (end !== 'all' && startSelect.value !== 'all' && startSelect.value > end) {
        startSelect.value = end;
        state.filters.startMonth = end;
    }
}

// 期間フィルター適用後のデータを取得（ダッシュボード・KPI等で共通利用）
function getFilteredDataForAnalytics() {
    const monthField = state.activeBase === 'billing' ? 'billing_month' : 'usage_month';
    return state.rawData.filter(item => {
        const val = item[monthField];
        if (state.filters.startMonth !== 'all' && val < state.filters.startMonth) return false;
        if (state.filters.endMonth !== 'all' && val > state.filters.endMonth) return false;
        return true;
    });
}

// ビュー切り替え
function switchView(targetId) {
    const sections = document.querySelectorAll('.view-section');
    sections.forEach(s => s.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
    
    // タイトルの更新
    const titleMap = {
        'dashboard-view': 'ダッシュボード',
        'table-view': '明細一覧',
        'settings-view': '設定'
    };
    document.getElementById('view-title').textContent = titleMap[targetId];
    
    // グラフは表示された時にサイズがおかしくなることがあるので更新
    if (targetId === 'dashboard-view') {
        renderCharts();
    }
}

// データのロード
async function loadAllData(forceReload = false) {
    showToast('データを取得中...', 'info');
    try {
        const url = forceReload ? '/api/data?reload=true' : '/api/data';
        const [dataRes, settingsRes] = await Promise.all([
            fetch(url),
            fetch('/api/settings')
        ]);
        
        state.rawData = await dataRes.json();
        state.settings = await settingsRes.json();
        
        processData();
        renderSettings();
        
        showToast('データの読み込みが完了しました', 'success');
    } catch (e) {
        console.error(e);
        showToast('データの取得に失敗しました', 'danger');
    }
}

// データのパースと各コンポーネントの再描画
function processData() {
    // フィルター用のセレクトボックス選択肢を動的生成
    populateFilterOptions();
    
    // 統計値（KPI）の計算
    calculateKPIs();
    
    // グラフの描画
    renderCharts();
    
    // テーブル明細の描画
    renderFilteredTable();
}

// セレクトボックスの選択肢生成
function populateFilterOptions() {
    const carriers = new Set();
    const cards = new Set();
    const months = new Set();

    state.rawData.forEach(item => {
        carriers.add(getDisplayCarrier(item));
        cards.add(item.card_name);
        months.add(state.activeBase === 'billing' ? item.billing_month : item.usage_month);
    });

    // キャリアフィルター
    const carrierSelect = document.getElementById('filter-carrier');
    const prevCarrier = carrierSelect.value;
    carrierSelect.innerHTML = '<option value="all">すべて</option>';
    Array.from(carriers).sort().forEach(c => {
        carrierSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
    if (Array.from(carriers).includes(prevCarrier)) {
        carrierSelect.value = prevCarrier;
    }

    // カードフィルター
    const cardSelect = document.getElementById('filter-card');
    const prevCard = cardSelect.value;
    cardSelect.innerHTML = '<option value="all">すべて</option>';
    Array.from(cards).sort().forEach(c => {
        cardSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
    if (Array.from(cards).includes(prevCard)) {
        cardSelect.value = prevCard;
    }

    // 開始月・終了月フィルターの選択肢
    const startSelect = document.getElementById('filter-start-month');
    const endSelect = document.getElementById('filter-end-month');
    const prevStart = startSelect.value;
    const prevEnd = endSelect.value;

    const sortedMonths = Array.from(months).sort(); // 昇順

    startSelect.innerHTML = '<option value="all">最古</option>';
    endSelect.innerHTML = '<option value="all">最新</option>';

    sortedMonths.forEach(m => {
        startSelect.innerHTML += `<option value="${m}">${m}</option>`;
        endSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });

    if (prevStart === 'all' || sortedMonths.includes(prevStart)) {
        startSelect.value = prevStart;
    }
    if (prevEnd === 'all' || sortedMonths.includes(prevEnd)) {
        endSelect.value = prevEnd;
    }
}

// 統計値の計算
function calculateKPIs() {
    const monthField = state.activeBase === 'billing' ? 'billing_month' : 'usage_month';
    
    // 月ごとの合計を算出
    const monthlyTotals = {};
    getFilteredDataForAnalytics().forEach(item => {
        const m = item[monthField];
        monthlyTotals[m] = (monthlyTotals[m] || 0) + item.amount;
    });

    const sortedMonths = Object.keys(monthlyTotals).sort();
    
    if (sortedMonths.length === 0) {
        document.getElementById('kpi-latest-total').textContent = '¥0';
        document.getElementById('kpi-latest-month').textContent = 'データなし';
        document.getElementById('kpi-mom-diff').textContent = '¥0';
        document.getElementById('kpi-mom-percent').textContent = '--% (前月比)';
        document.getElementById('kpi-avg-monthly').textContent = '¥0';
        document.getElementById('kpi-year-total').textContent = '¥0';
        return;
    }

    // 最新月と前月のデータ
    const latestMonth = sortedMonths[sortedMonths.length - 1];
    const latestTotal = monthlyTotals[latestMonth];
    
    document.getElementById('kpi-latest-total').textContent = `¥${latestTotal.toLocaleString()}`;
    document.getElementById('kpi-latest-month').textContent = `${latestMonth.replace('-', '年')}月`;

    // 前月比の計算
    if (sortedMonths.length >= 2) {
        const prevMonth = sortedMonths[sortedMonths.length - 2];
        const prevTotal = monthlyTotals[prevMonth];
        const diff = latestTotal - prevTotal;
        const percent = ((latestTotal / prevTotal) - 1) * 100;
        
        const sign = diff >= 0 ? '+' : '';
        document.getElementById('kpi-mom-diff').textContent = `¥${sign}${diff.toLocaleString()}`;
        document.getElementById('kpi-mom-percent').textContent = `${sign}${percent.toFixed(1)}% (前月比)`;
        
        // 色設定
        const diffCard = document.getElementById('kpi-mom-diff').parentElement;
        if (diff > 0) {
            diffCard.style.borderTop = '3px solid #ef4444'; // 上昇は赤
        } else {
            diffCard.style.borderTop = '3px solid #10b981'; // 下降は緑
        }
    } else {
        document.getElementById('kpi-mom-diff').textContent = '¥0';
        document.getElementById('kpi-mom-percent').textContent = '--% (前月比)';
    }

    // 直近12ヶ月の平均・累計
    const last12Months = sortedMonths.slice(-12);
    let totalSum12 = 0;
    last12Months.forEach(m => {
        totalSum12 += monthlyTotals[m];
    });
    const avgMonthly = Math.round(totalSum12 / last12Months.length);

    document.getElementById('kpi-avg-monthly').textContent = `¥${avgMonthly.toLocaleString()}`;
    document.getElementById('kpi-year-total').textContent = `¥${totalSum12.toLocaleString()}`;
}

// グラフ描画（全グラフ）
function renderCharts() {
    renderTrendChart();
    renderCarrierChart();
    renderCardChart();
}

// 1. 月別推移グラフ (Trend)
function renderTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (state.charts.trend) state.charts.trend.destroy();

    const monthField = state.activeBase === 'billing' ? 'billing_month' : 'usage_month';
    
    // 月別・キャリア別のデータ集計
    const monthlyCarrierTotals = {};
    const carriersSet = new Set();
    const monthsSet = new Set();

    getFilteredDataForAnalytics().forEach(item => {
        const m = item[monthField];
        const c = getDisplayCarrier(item);
        carriersSet.add(c);
        monthsSet.add(m);

        if (!monthlyCarrierTotals[m]) monthlyCarrierTotals[m] = {};
        monthlyCarrierTotals[m][c] = (monthlyCarrierTotals[m][c] || 0) + item.amount;
    });

    const sortedMonths = Array.from(monthsSet).sort();
    const carriers = Array.from(carriersSet).sort();

    // Chart.js 用の datasets 生成
    // 配色定義
    const colors = [
        '#6366f1', // Indigo
        '#06b6d4', // Cyan
        '#10b981', // Emerald
        '#f59e0b', // Amber
        '#ec4899', // Pink
        '#8b5cf6', // Purple
        '#3b82f6'  // Blue
    ];

    const datasets = carriers.map((carrier, idx) => {
        const data = sortedMonths.map(month => {
            return monthlyCarrierTotals[month][carrier] || 0;
        });

        const color = colors[idx % colors.length];
        return {
            label: carrier,
            data: data,
            borderColor: color,
            backgroundColor: state.chartType === 'line' ? 'transparent' : color,
            fill: false,
            tension: 0.3,
            borderWidth: 2
        };
    });

    state.charts.trend = new Chart(ctx, {
        type: state.chartType,
        data: {
            labels: sortedMonths,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af', font: { size: 12 } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return '¥' + value.toLocaleString();
                        }
                    },
                    stacked: state.chartType === 'bar' // 棒グラフの場合は積み上げ
                }
            }
        }
    });
}

// 2. キャリア比率グラフ (Carrier Pie)
function renderCarrierChart() {
    const ctx = document.getElementById('carrierChart').getContext('2d');
    if (state.charts.carrier) state.charts.carrier.destroy();

    // キャリア別の総額集計
    const carrierTotals = {};
    getFilteredDataForAnalytics().forEach(item => {
        const c = getDisplayCarrier(item);
        carrierTotals[c] = (carrierTotals[c] || 0) + item.amount;
    });

    const labels = Object.keys(carrierTotals);
    const data = Object.values(carrierTotals);
    
    const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

    state.charts.carrier = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 1,
                borderColor: '#1f2937'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af' }
                }
            },
            cutout: '70%'
        }
    });
}

// 3. クレジットカード比率グラフ (Card Pie)
function renderCardChart() {
    const ctx = document.getElementById('cardChart').getContext('2d');
    if (state.charts.card) state.charts.card.destroy();

    // カード別の総額集計
    const cardTotals = {};
    getFilteredDataForAnalytics().forEach(item => {
        const c = item.card_name;
        cardTotals[c] = (cardTotals[c] || 0) + item.amount;
    });

    const labels = Object.keys(cardTotals);
    const data = Object.values(cardTotals);
    
    const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#ec4899'];

    state.charts.card = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 1,
                borderColor: '#1f2937'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af' }
                }
            },
            cutout: '70%'
        }
    });
}

// 明細テーブルの絞り込みと描画
function renderFilteredTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    const monthField = state.activeBase === 'billing' ? 'billing_month' : 'usage_month';
    const searchQuery = state.filters.search.toLowerCase();
    
    // フィルタリング処理
    let filtered = getFilteredDataForAnalytics().filter(item => {
        const matchesSearch = item.store.toLowerCase().includes(searchQuery) || 
                            item.card_name.toLowerCase().includes(searchQuery);
                            
        const matchesCarrier = state.filters.carrier === 'all' || 
                             getDisplayCarrier(item) === state.filters.carrier;
                             
        const matchesCard = state.filters.card === 'all' || 
                          item.card_name === state.filters.card;

        return matchesSearch && matchesCarrier && matchesCard;
    });

    // ソート処理
    filtered.sort((a, b) => {
        let valA = a[state.sortColumn];
        let valB = b[state.sortColumn];
        
        // 特殊ケース：金額
        if (state.sortColumn === 'amount') {
            valA = Number(valA);
            valB = Number(valB);
        }
        
        if (valA < valB) return state.sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return state.sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // テーブル描画
    let sum = 0;
    filtered.forEach(item => {
        sum += item.amount;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.usage_date}</td>
            <td>${item.billing_month}</td>
            <td>
                <span class="store-name">${item.store}</span>
                <span class="carrier-badge badge-${getDisplayCarrier(item) === 'その他通信費' ? 'other' : 'carrier'}">${getDisplayCarrier(item)}</span>
            </td>
            <td>
                <span class="card-chip">${item.card_name}</span>
                <span class="card-num-sub">${item.card_number}</span>
            </td>
            <td class="text-right font-semibold">¥${item.amount.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });

    // フッター情報更新
    document.getElementById('filtered-count').textContent = filtered.length;
    document.getElementById('total-count').textContent = state.rawData.length;
    document.getElementById('filtered-sum').textContent = `¥${sum.toLocaleString()}`;
}

// 設定のレンダリング
function renderSettings() {
    // キーワードタグ表示
    const keywordsContainer = document.getElementById('keywords-container');
    keywordsContainer.innerHTML = '';
    state.settings.keywords.forEach((kw, idx) => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            <span>${kw}</span>
            <i class="fa-solid fa-xmark tag-remove" onclick="removeKeyword(${idx})"></i>
        `;
        keywordsContainer.appendChild(tag);
    });

    // フォルダリスト表示
    const dirsContainer = document.getElementById('dirs-container');
    dirsContainer.innerHTML = '';
    state.settings.directories.forEach((dir, idx) => {
        const item = document.createElement('li');
        item.className = 'dir-item';
        item.innerHTML = `
            <span class="dir-path">${dir}</span>
            <button class="dir-remove" onclick="removeDirectory(${idx})">
                <i class="fa-regular fa-trash-can"></i>
            </button>
        `;
        dirsContainer.appendChild(item);
    });
}

// キーワードの追加
function addKeyword() {
    const input = document.getElementById('new-keyword-input');
    const val = input.value.trim();
    if (val && !state.settings.keywords.includes(val)) {
        state.settings.keywords.push(val);
        renderSettings();
        input.value = '';
    }
}

// キーワードの削除
window.removeKeyword = function(index) {
    state.settings.keywords.splice(index, 1);
    renderSettings();
};

// ディレクトリの追加
function addDirectory() {
    const input = document.getElementById('new-dir-input');
    const val = input.value.trim();
    if (val && !state.settings.directories.includes(val)) {
        state.settings.directories.push(val);
        renderSettings();
        input.value = '';
    }
}

// ディレクトリの削除
window.removeDirectory = function(index) {
    state.settings.directories.splice(index, 1);
    renderSettings();
};

// 設定をサーバーに保存
async function saveSettingsToServer() {
    showToast('設定を保存中...', 'info');
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.settings)
        });
        const resData = await res.json();
        if (resData.status === 'success') {
            state.settings = resData.settings;
            showToast('設定を保存し適用しました', 'success');
            // 設定保存後にデータを再読み込み
            loadAllData();
        } else {
            showToast('設定の保存に失敗しました', 'danger');
        }
    } catch (e) {
        console.error(e);
        showToast('エラーが発生しました', 'danger');
    }
}

// トースト通知の表示
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msgSpan = document.getElementById('toast-message');
    
    // 背景色の切り替え
    toast.className = 'toast'; // リセット
    if (type === 'success') {
        toast.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    } else if (type === 'info') {
        toast.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
    } else if (type === 'danger') {
        toast.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    }

    msgSpan.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
