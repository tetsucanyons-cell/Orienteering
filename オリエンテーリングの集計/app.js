/**
 * Orienteering Ranker - Application State & Logic
 */

// --- アプリケーションの状態管理 ---
let state = {
    schoolName: '',           // 学校名・大会名
    classType: 'alpha',       // 'alpha' (A, B...) or 'num' (1組, 2組...)
    classCount: 8,            // クラス数 (初期値: 8, 最大: 20)
    selectedClasses: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], // クラス名リスト
    bulkTeamCount: 6,         // 各クラスのチーム数一括設定 (初期値: 6)
    numberRule: 'seq',        // 'seq' (全体連番) or 'reset' (クラスごと)
    classTeamCounts: {},      // 個別のクラスチーム数設定（空の場合はbulkTeamCountを使用。0を許容）
    classGroups: {},          // クラスごとの日程グループ。例: { 'A': '1', 'B': '1', 'D': '2' }
    activeInputFilter: 'all', // 得点入力画面での表示フィルター ('all' | '1' | '2')
    activeRankingFilter: 'all', // 順位表での集計・表示フィルター ('all' | '1' | '2')
    teamCount: 48,            // 合計チーム数 (初期値: 8クラス * 6チーム = 48)
    teams: [],
    currentView: 'sec-setup'
};

// ローカルストレージの保存キー
const STORAGE_KEY = 'orienteering_ranker_state';

// --- DOM 要素の取得 ---
const sections = {
    setup: document.getElementById('sec-setup'),
    input: document.getElementById('sec-input'),
    ranking: document.getElementById('sec-ranking')
};

const navItems = document.querySelectorAll('.app-nav .nav-item');
const btnStartSetup = document.getElementById('btn-start-setup');
const divTeamNamesSetup = document.getElementById('div-team-names-setup');
const listTeamNames = document.getElementById('list-team-names');
const btnConfirmNames = document.getElementById('btn-confirm-names');
const listScoreInputs = document.getElementById('list-score-inputs');
const inputSearchTeam = document.getElementById('input-search-team');
const btnGoToRanking = document.getElementById('btn-go-to-ranking');
const tableRankingBody = document.getElementById('body-ranking');
const btnBackToInput = document.getElementById('btn-back-to-input');
const btnPrint = document.getElementById('btn-print');
const printDateEl = document.getElementById('print-current-date');
const btnResetAll = document.getElementById('btn-reset-all');

// 新規追加されたDOM要素
const inputSchoolName = document.getElementById('input-school-name');
const printSchoolName = document.getElementById('print-school-name');
const radioClassTypes = document.getElementsByName('class-type');
const inputClassCountPc = document.getElementById('input-class-count-pc');
const inputClassCountMob = document.getElementById('input-class-count-mob');
const inputBulkTeamCountPc = document.getElementById('input-bulk-team-count-pc');
const inputBulkTeamCountMob = document.getElementById('input-bulk-team-count-mob');
const btnToggleDetails = document.getElementById('btn-toggle-details');
const divClassDetails = document.getElementById('div-class-details');
const radioNumberRules = document.getElementsByName('number-rule');
const listClassTeamCounts = document.getElementById('list-class-team-counts');
const spanTotalTeams = document.getElementById('span-total-teams');

// モーダル要素
const modalConfirm = document.getElementById('modal-confirm');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    detectDevice();
    initApp();
    window.addEventListener('resize', detectDevice);
});

function detectDevice() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth < 768;
    // タッチデバイス、または画面幅768px未満をモバイルと判定
    const isMobile = isSmallScreen || (isTouch && window.innerWidth < 1024);
    
    if (isMobile) {
        document.body.classList.add('is-mobile');
        document.body.classList.remove('is-pc');
    } else {
        document.body.classList.add('is-pc');
        document.body.classList.remove('is-mobile');
    }
}

function initApp() {
    setupEventListeners();
    
    // ローカルストレージからデータを復元
    if (loadState()) {
        applyFiltersToUI();
        if (state.teams && state.teams.length > 0) {
            // データがすでに存在する場合、設定画面をスキップして入力画面または前回の画面を表示
            renderScoreInputs();
            
            // 入力中画面へ遷移
            switchView(state.currentView || 'sec-input');
        } else {
            // 設定値だけが保存されている場合は設定UIの初期描画を行う
            applyStateToSetupUI();
            switchView('sec-setup');
        }
    } else {
        // デフォルト状態で初期描画
        applyStateToSetupUI();
        switchView('sec-setup');
    }
}

function applyFiltersToUI() {
    const inputFilter = state.activeInputFilter || 'all';
    const filterInputBtns = document.querySelectorAll('.btn-filter-group');
    filterInputBtns.forEach(btn => {
        if (btn.getAttribute('data-filter') === inputFilter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const rankingFilter = state.activeRankingFilter || 'all';
    const filterRankingTabs = document.querySelectorAll('.ranking-tab');
    filterRankingTabs.forEach(tab => {
        if (tab.getAttribute('data-filter') === rankingFilter) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    const subtitleEl = document.getElementById('print-ranking-subtitle');
    if (subtitleEl) {
        const activeTab = document.querySelector('.ranking-tab.active');
        if (activeTab) {
            subtitleEl.textContent = activeTab.textContent.replace('順位', '');
        }
    }
}

// --- イベントリスナーの設定 ---
function setupEventListeners() {
    // 1. 設定画面
    // 学校名入力イベント
    if (inputSchoolName) {
        inputSchoolName.addEventListener('input', (e) => {
            state.schoolName = e.currentTarget.value.trim();
            saveState();
        });
    }

    // クラス表記切り替えイベント
    if (radioClassTypes) {
        radioClassTypes.forEach(radio => {
            radio.addEventListener('change', handleClassTypeChange);
        });
    }

    // クラス数変更イベント (PC / スマホ両方の同期と処理)
    if (inputClassCountPc) {
        inputClassCountPc.addEventListener('input', (e) => {
            if (inputClassCountMob) inputClassCountMob.value = e.currentTarget.value;
            handleClassCountChange(e);
        });
    }
    if (inputClassCountMob) {
        inputClassCountMob.addEventListener('change', (e) => {
            if (inputClassCountPc) inputClassCountPc.value = e.currentTarget.value;
            handleClassCountChange(e);
        });
    }

    // 一括チーム数変更イベント (PC / スマホ両方の同期と処理)
    if (inputBulkTeamCountPc) {
        inputBulkTeamCountPc.addEventListener('input', (e) => {
            if (inputBulkTeamCountMob) inputBulkTeamCountMob.value = e.currentTarget.value;
            handleBulkTeamCountChange(e);
        });
    }
    if (inputBulkTeamCountMob) {
        inputBulkTeamCountMob.addEventListener('change', (e) => {
            if (inputBulkTeamCountPc) inputBulkTeamCountPc.value = e.currentTarget.value;
            handleBulkTeamCountChange(e);
        });
    }

    // 詳細設定（個別調整）アコーディオン開閉
    if (btnToggleDetails) {
        btnToggleDetails.addEventListener('click', toggleClassDetails);
    }

    // チーム番号ルール切り替えイベント
    if (radioNumberRules) {
        radioNumberRules.forEach(radio => {
            radio.addEventListener('change', (e) => {
                state.numberRule = e.currentTarget.value;
                saveState();
            });
        });
    }

    if (btnStartSetup) btnStartSetup.addEventListener('click', handleStartSetup);
    if (btnConfirmNames) btnConfirmNames.addEventListener('click', handleConfirmNames);

    // 2. 入力画面の検索
    inputSearchTeam.addEventListener('input', handleSearch);

    // 3. ナビゲーションおよび画面遷移
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetSec = e.currentTarget.getAttribute('data-target');
            
            // チーム情報が未設定の場合は設定画面から遷移させない
            if (state.teams.length === 0 && targetSec !== 'sec-setup') {
                alert('先に初期設定とチーム生成を完了してください。');
                return;
            }
            
            if (targetSec === 'sec-ranking') {
                renderRanking();
            }
            switchView(targetSec);
        });
    });

    btnGoToRanking.addEventListener('click', () => {
        renderRanking();
        switchView('sec-ranking');
    });

    btnBackToInput.addEventListener('click', () => {
        switchView('sec-input');
    });

    // 4. 印刷機能
    btnPrint.addEventListener('click', handlePrint);

    // 5. リセット（初期化）機能
    if (btnResetAll) btnResetAll.addEventListener('click', showResetModal);
    if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', hideResetModal);
    if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', resetAllData);

    // 6. 日程（グループ）別フィルター（得点入力画面）
    const filterInputBtns = document.querySelectorAll('.btn-filter-group');
    filterInputBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterInputBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.activeInputFilter = e.currentTarget.getAttribute('data-filter');
            saveState();
            renderScoreInputs(); // 再描画
        });
    });

    // 7. 日程（グループ）別集計タブ（順位表画面）
    const filterRankingTabs = document.querySelectorAll('.ranking-tab');
    filterRankingTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            filterRankingTabs.forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.activeRankingFilter = e.currentTarget.getAttribute('data-filter');
            
            // 印刷用サブタイトルの更新
            const subtitleEl = document.getElementById('print-ranking-subtitle');
            if (subtitleEl) {
                const filterText = e.currentTarget.textContent.replace('順位', '');
                subtitleEl.textContent = filterText;
            }
            
            saveState();
            renderRanking(); // 順位表の再計算と描画
        });
    });
}

// --- 画面切り替え ---
function switchView(sectionId) {
    state.currentView = sectionId;
    saveState();

    // 全セクション非表示
    Object.values(sections).forEach(sec => sec.classList.remove('active'));
    // 対象セクション表示
    sections[sectionId.replace('sec-', '')].classList.add('active');

    // ナビゲーションのactiveクラス切り替え
    navItems.forEach(item => {
        if (item.getAttribute('data-target') === sectionId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // スムーズスクロールでページトップへ
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 設定セクション UI描画 & ロジック ---

// 保存された/デフォルトのstateを初期設定画面に適用
function applyStateToSetupUI() {
    // 学校名の適用
    if (inputSchoolName) inputSchoolName.value = state.schoolName || '';

    // クラス表記ラジオボタンの適用
    if (radioClassTypes) {
        radioClassTypes.forEach(radio => {
            if (radio.value === state.classType) {
                radio.checked = true;
            }
        });
    }

    // クラス数の適用 (PC/スマホ両方)
    const classCount = state.classCount || 8;
    if (inputClassCountPc) inputClassCountPc.value = classCount;
    if (inputClassCountMob) inputClassCountMob.value = classCount;

    // 一括チーム数の適用 (PC/スマホ両方)
    const bulkCount = state.bulkTeamCount || 6;
    if (inputBulkTeamCountPc) inputBulkTeamCountPc.value = bulkCount;
    if (inputBulkTeamCountMob) inputBulkTeamCountMob.value = bulkCount;

    // 番号ルールラジオボタンの適用
    if (radioNumberRules) {
        radioNumberRules.forEach(radio => {
            if (radio.value === state.numberRule) {
                radio.checked = true;
            }
        });
    }

    // クラス名リストを生成
    generateClasses();

    // クラスごとのチーム数入力リストの描画
    renderClassTeamCountsInputs();
}

// クラス名リストを動的生成する
function generateClasses() {
    const list = [];
    const count = Math.min(Math.max(parseInt(state.classCount) || 8, 1), 20);
    state.classCount = count; // 値の補正

    if (state.classType === 'alpha') {
        for (let i = 0; i < count; i++) {
            list.push(String.fromCharCode(65 + i)); // A = 65
        }
    } else {
        for (let i = 1; i <= count; i++) {
            list.push(`${i}組`);
        }
    }
    state.selectedClasses = list;
}

// クラスタイプが変更された際の処理
function handleClassTypeChange(e) {
    const type = e.currentTarget.value;
    state.classType = type;

    // クラス一覧の再生成と初期化
    generateClasses();
    renderClassTeamCountsInputs();
    saveState();
}

// クラス数が変更された際の処理
function handleClassCountChange(e) {
    let count = parseInt(e.currentTarget.value);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 20) count = 20;

    state.classCount = count;
    generateClasses();
    renderClassTeamCountsInputs();
    saveState();
}

// 一括チーム数が変更された際の処理
function handleBulkTeamCountChange(e) {
    let count = parseInt(e.currentTarget.value);
    if (isNaN(count) || count < 0) count = 0;
    if (count > 30) count = 30;

    state.bulkTeamCount = count;
    
    // 選択されているすべてのクラスの個別カウントを一括設定値で更新
    state.selectedClasses.forEach(cls => {
        state.classTeamCounts[cls] = count;
    });

    renderClassTeamCountsInputs();
    saveState();
}

// アコーディオン開閉
function toggleClassDetails() {
    const isHidden = divClassDetails.classList.toggle('hidden');
    btnToggleDetails.classList.toggle('open', !isHidden);
}

// セレクトボックスのオプションHTML生成ヘルパー
function generateOptionsHtml(min, max, selectedVal) {
    let html = '';
    const sel = parseInt(selectedVal);
    for (let i = min; i <= max; i++) {
        html += `<option value="${i}" ${i === sel ? 'selected' : ''}>${i}</option>`;
    }
    return html;
}

// クラス別のチーム数入力リストのレンダリング
function renderClassTeamCountsInputs() {
    if (!listClassTeamCounts) return;
    listClassTeamCounts.innerHTML = '';

    if (state.selectedClasses.length === 0) {
        listClassTeamCounts.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">クラスが指定されていません</div>';
        updateTotalTeamsDisplay();
        return;
    }

    state.selectedClasses.forEach(cls => {
        const row = document.createElement('div');
        row.className = 'class-count-row animate-fade-in';
        
        // 個別カウントがない場合はbulkTeamCountを使う
        const count = state.classTeamCounts[cls] !== undefined ? state.classTeamCounts[cls] : state.bulkTeamCount;
        // 日程グループの取得 (デフォルト: '1')
        const group = state.classGroups[cls] !== undefined ? state.classGroups[cls] : '1';

        row.innerHTML = `
            <span>${cls}クラス</span>
            <div class="class-row-controls">
                <!-- チーム数設定 -->
                <div class="class-control-item">
                    <span class="control-label">チーム数:</span>
                    <!-- PC用 -->
                    <div class="pc-only inline-wrapper">
                        <input type="number" min="0" max="30" value="${count}" data-class="${cls}" class="class-team-count-input-pc" inputmode="numeric">
                    </div>
                    <!-- スマホ用 -->
                    <div class="mobile-only inline-wrapper">
                        <select data-class="${cls}" class="class-team-count-input-mob">
                            ${generateOptionsHtml(0, 30, count)}
                        </select>
                    </div>
                </div>
                <!-- 日程グループ設定 -->
                <div class="class-control-item">
                    <span class="control-label">日程:</span>
                    <select data-class="${cls}" class="class-group-select">
                        <option value="1" ${group === '1' ? 'selected' : ''}>前半</option>
                        <option value="2" ${group === '2' ? 'selected' : ''}>後半</option>
                    </select>
                </div>
            </div>
        `;
        listClassTeamCounts.appendChild(row);

        // イベント登録
        const pcInput = row.querySelector('.class-team-count-input-pc');
        const mobSelect = row.querySelector('.class-team-count-input-mob');
        const groupSelect = row.querySelector('.class-group-select');

        pcInput.addEventListener('input', (e) => {
            mobSelect.value = e.currentTarget.value;
            handleClassTeamCountChange(e);
        });
        pcInput.addEventListener('focus', (e) => e.currentTarget.select());

        mobSelect.addEventListener('change', (e) => {
            pcInput.value = e.currentTarget.value;
            handleClassTeamCountChange(e);
        });

        groupSelect.addEventListener('change', (e) => {
            state.classGroups[cls] = e.currentTarget.value;
            saveState();
        });
    });

    updateTotalTeamsDisplay();
}

// 個別クラスのチーム数が変更された際の処理
function handleClassTeamCountChange(e) {
    const input = e.currentTarget;
    const cls = input.getAttribute('data-class');
    let val = parseInt(input.value);

    if (isNaN(val) || val < 0) val = 0;
    if (val > 30) val = 30; // 異常な数を防ぐ上限設定

    state.classTeamCounts[cls] = val;
    updateTotalTeamsDisplay();
    saveState();
}

// 合計チーム数の集計とバッジ表示の更新
function updateTotalTeamsDisplay() {
    let total = 0;
    state.selectedClasses.forEach(cls => {
        total += state.classTeamCounts[cls] !== undefined ? state.classTeamCounts[cls] : state.bulkTeamCount;
    });
    
    state.teamCount = total;
    spanTotalTeams.textContent = total;
}

// チーム名の自動命名生成と確認画面への遷移
function handleStartSetup() {
    if (state.selectedClasses.length === 0 || state.teamCount === 0) {
        alert('少なくとも1つ以上のクラスを選択し、チーム数を設定してください。');
        return;
    }

    // 自動命名ルールの実行
    const generatedTeams = [];
    let globalIndex = 1; // 学年連番用

    state.selectedClasses.forEach(cls => {
        const teamCountForClass = state.classTeamCounts[cls] !== undefined ? state.classTeamCounts[cls] : state.bulkTeamCount;
        if (teamCountForClass === 0) return; // 0チームの場合はスキップ
        
        for (let i = 1; i <= teamCountForClass; i++) {
            // 連番ルールの適用
            // seq (学年連番): A-1, A-2, B-3, B-4...
            // reset (クラスごと): A-1, A-2, B-1, B-2...
            const num = state.numberRule === 'seq' ? globalIndex : i;
            const teamName = `${cls}-${num}`;

            generatedTeams.push({
                name: teamName,
                class: cls,
                numInClass: i,
                globalNum: globalIndex
            });
            globalIndex++;
        }
    });

    // チーム名確認・個別カスタマイズ用リストの描画
    listTeamNames.innerHTML = '';
    
    generatedTeams.forEach((gt, idx) => {
        const id = idx + 1;
        // 既存の同IDのチームがあればそのカスタム名を引き継ぐ
        const oldTeam = state.teams.find(t => t.id === id);
        // 引き継ぐ条件：元のチームの構成クラスが同じ、かつ名前が編集されていた場合
        const name = (oldTeam && oldTeam.originalClass === gt.class && oldTeam.numInClass === gt.numInClass) 
            ? oldTeam.name 
            : gt.name;

        const div = document.createElement('div');
        div.className = 'grid-input-item';
        div.innerHTML = `
            <label for="name-input-${id}">チーム ${id}</label>
            <input type="text" id="name-input-${id}" class="team-name-init-input" data-id="${id}" data-class="${gt.class}" data-num-in-class="${gt.numInClass}" value="${name}" placeholder="${gt.name}">
        `;
        listTeamNames.appendChild(div);
    });

    divTeamNamesSetup.classList.remove('hidden');
    // カスタマイズ画面へスムーズスクロール
    divTeamNamesSetup.scrollIntoView({ behavior: 'smooth' });
}

function handleConfirmNames() {
    const nameInputs = document.querySelectorAll('.team-name-init-input');
    const newTeams = [];

    nameInputs.forEach(input => {
        const id = parseInt(input.getAttribute('data-id'));
        const name = input.value.trim() || input.placeholder;
        const cls = input.getAttribute('data-class');
        const numInClass = parseInt(input.getAttribute('data-num-in-class'));
        
        // 既存のデータを取得（スコア等を保持するため）
        const oldTeam = state.teams.find(t => t.id === id);
        
        newTeams.push({
            id: id,
            name: name,
            originalClass: cls,       // 変更後のクラス判定用
            numInClass: numInClass,
            baseScore: oldTeam ? oldTeam.baseScore : 0,
            specialScore: oldTeam ? oldTeam.specialScore : 0,
            penaltyScore: oldTeam ? oldTeam.penaltyScore : 0,
            totalScore: oldTeam ? oldTeam.totalScore : 0
        });
    });

    state.teams = newTeams;
    saveState();

    // 入力用UIカードの生成
    renderScoreInputs();
    switchView('sec-input');
}

// --- 入力セクション ロジック ---
function renderScoreInputs() {
    if (!listScoreInputs) return;
    listScoreInputs.innerHTML = '';
    
    // 日程フィルターの取得 (デフォルト: 'all')
    const filter = state.activeInputFilter || 'all';
    // 検索クエリ
    const query = inputSearchTeam ? inputSearchTeam.value.trim().toLowerCase() : '';
    
    state.teams.forEach(team => {
        // 1. 検索一致チェック
        if (query && !team.name.toLowerCase().includes(query)) {
            return;
        }

        // 2. 日程グループ一致チェック
        const teamGroup = state.classGroups[team.originalClass] || '1';
        if (filter !== 'all' && teamGroup !== filter) {
            return;
        }

        const card = document.createElement('div');
        card.className = 'score-card animate-fade-in';
        card.setAttribute('data-team-name', team.name.toLowerCase());
        card.setAttribute('data-team-id', team.id);

        card.innerHTML = `
            <div class="score-card-header">
                <span class="team-name-display">${escapeHTML(team.name)}</span>
                <span class="team-number-badge">ID: ${team.id}</span>
            </div>
            
            <div class="score-card-inputs">
                <!-- 基本課題 -->
                <div class="score-input-group">
                    <label for="base-${team.id}-pc" class="pc-only">基本課題</label>
                    <label for="base-${team.id}-mob" class="mobile-only">基本課題</label>
                    <div class="pc-only">
                        <input type="number" id="base-${team.id}-pc" class="score-input-pc" data-id="${team.id}" data-type="base" value="${team.baseScore}" inputmode="numeric">
                    </div>
                    <div class="mobile-only">
                        <select id="base-${team.id}-mob" class="score-select-mob" data-id="${team.id}" data-type="base">
                            ${generateOptionsHtml(0, 150, team.baseScore)}
                        </select>
                    </div>
                </div>
                <!-- 特別課題 -->
                <div class="score-input-group">
                    <label for="special-${team.id}-pc" class="pc-only">特別課題</label>
                    <label for="special-${team.id}-mob" class="mobile-only">特別課題</label>
                    <div class="pc-only">
                        <input type="number" id="special-${team.id}-pc" class="score-input-pc" data-id="${team.id}" data-type="special" value="${team.specialScore}" inputmode="numeric">
                    </div>
                    <div class="mobile-only">
                        <select id="special-${team.id}-mob" class="score-select-mob" data-id="${team.id}" data-type="special">
                            ${generateOptionsHtml(0, 100, team.specialScore)}
                        </select>
                    </div>
                </div>
                <!-- マイナス点 -->
                <div class="score-input-group penalty">
                    <label class="text-danger pc-only" for="penalty-${team.id}-pc">マイナス点</label>
                    <label class="text-danger mobile-only" for="penalty-${team.id}-mob">マイナス点</label>
                    <div class="pc-only">
                        <input type="number" id="penalty-${team.id}-pc" class="score-input-pc text-danger" data-id="${team.id}" data-type="penalty" value="${team.penaltyScore}" inputmode="numeric">
                    </div>
                    <div class="mobile-only">
                        <select id="penalty-${team.id}-mob" class="score-select-mob text-danger" data-id="${team.id}" data-type="penalty">
                            ${generateOptionsHtml(0, 100, team.penaltyScore)}
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="score-card-total">
                合計点:<span id="total-${team.id}">${team.totalScore}</span>点
            </div>
        `;
        listScoreInputs.appendChild(card);
    });

    // スコア入力時のリアルタイム計算とデータ保存のイベントバインド (PC用)
    const pcInputs = listScoreInputs.querySelectorAll('.score-input-pc');
    pcInputs.forEach(input => {
        const teamId = input.getAttribute('data-id');
        const type = input.getAttribute('data-type');
        const mobSelect = listScoreInputs.querySelector(`#${type}-${teamId}-mob`);

        input.addEventListener('input', (e) => {
            const val = e.currentTarget.value;
            if (mobSelect) {
                mobSelect.value = val;
            }
            handleScoreChange(e);
        });
        
        input.addEventListener('focus', (e) => {
            e.currentTarget.select();
        });
    });

    // スコア入力時のリアルタイム計算とデータ保存のイベントバインド (スマホ用)
    const mobSelects = listScoreInputs.querySelectorAll('.score-select-mob');
    mobSelects.forEach(select => {
        const teamId = select.getAttribute('data-id');
        const type = select.getAttribute('data-type');
        const pcInput = listScoreInputs.querySelector(`#${type}-${teamId}-pc`);

        select.addEventListener('change', (e) => {
            const val = e.currentTarget.value;
            if (pcInput) {
                pcInput.value = val;
            }
            handleScoreChange(e);
        });
    });
}

function handleScoreChange(e) {
    const input = e.currentTarget;
    const teamId = parseInt(input.getAttribute('data-id'));
    const scoreType = input.getAttribute('data-type'); // 'base', 'special', 'penalty'
    
    // 入力値の取得（空欄の場合は0）
    let val = parseInt(input.value);
    if (isNaN(val)) val = 0;

    // stateを更新
    const team = state.teams.find(t => t.id === teamId);
    if (team) {
        if (scoreType === 'base') team.baseScore = val;
        if (scoreType === 'special') team.specialScore = val;
        if (scoreType === 'penalty') team.penaltyScore = val;
        
        // 合計点の計算 (基本 + 特別 - マイナス)
        team.totalScore = team.baseScore + team.specialScore - team.penaltyScore;
        
        // 画面に合計点を反映
        document.getElementById(`total-${teamId}`).textContent = team.totalScore;
        
        saveState();
    }
}

// チーム名検索機能
function handleSearch() {
    if (!inputSearchTeam) return;
    const query = inputSearchTeam.value.toLowerCase().trim();
    const filter = state.activeInputFilter || 'all';
    const cards = listScoreInputs.querySelectorAll('.score-card');

    cards.forEach(card => {
        const teamId = parseInt(card.getAttribute('data-team-id'));
        const team = state.teams.find(t => t.id === teamId);
        if (!team) return;

        const teamGroup = state.classGroups[team.originalClass] || '1';
        const matchesFilter = (filter === 'all' || teamGroup === filter);
        const matchesQuery = team.name.toLowerCase().includes(query);

        if (matchesFilter && matchesQuery) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// --- 順位表セクション ロジック ---
function renderRanking() {
    if (!tableRankingBody) return;
    tableRankingBody.innerHTML = '';

    if (state.teams.length === 0) {
        return;
    }

    // 集計フィルターの取得
    const filter = state.activeRankingFilter || 'all';

    // チームの絞り込み
    let filteredTeams = [...state.teams];
    if (filter !== 'all') {
        filteredTeams = filteredTeams.filter(t => {
            const teamGroup = state.classGroups[t.originalClass] || '1';
            return teamGroup === filter;
        });
    }

    // 学校名・大会名と対象チーム数をタイトルに反映
    const groupName = filter === '1' ? '【前半】' : (filter === '2' ? '【後半】' : '【総合】');
    const teamCountText = `(全${filteredTeams.length}チーム)`;
    const title = state.schoolName 
        ? `${state.schoolName} ${groupName}${teamCountText} 結果順位表` 
        : `結果順位表 ${groupName}${teamCountText}`;
    if (printSchoolName) printSchoolName.textContent = title;

    // 出力日を反映
    const today = new Date();
    const dateString = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    if (printDateEl) {
        printDateEl.textContent = `出力日: ${dateString}`;
    }

    // 得点の高い順にソート (同点の場合はマイナス点が少ない順、それでも同じならID順)
    filteredTeams.sort((a, b) => {
        if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
        }
        if (a.penaltyScore !== b.penaltyScore) {
            return a.penaltyScore - b.penaltyScore;
        }
        return a.id - b.id;
    });

    // 順位付け処理 (共同順位対応)
    let currentRank = 1;
    let prevScore = null;
    let prevPenalty = null;

    filteredTeams.forEach((team, index) => {
        // 同点タイの判定：合計点とマイナス点がいずれも前チームと同じ場合のみ同順位とする
        if (prevScore !== null && (team.totalScore !== prevScore || team.penaltyScore !== prevPenalty)) {
            currentRank = index + 1;
        }
        prevScore = team.totalScore;
        prevPenalty = team.penaltyScore;

        const tr = document.createElement('tr');
        
        let rankDisplay = `<span class="rank-badge">${currentRank}</span>`;
        if (currentRank === 1) rankDisplay = `<span class="rank-badge rank-1">🥇</span>`;
        else if (currentRank === 2) rankDisplay = `<span class="rank-badge rank-2">🥈</span>`;
        else if (currentRank === 3) rankDisplay = `<span class="rank-badge rank-3">🥉</span>`;

        tr.innerHTML = `
            <td class="col-rank">${rankDisplay}</td>
            <td class="col-team">${escapeHTML(team.name)}</td>
            <td class="col-score text-right">${team.baseScore}</td>
            <td class="col-score text-right">${team.specialScore}</td>
            <td class="col-score text-right text-danger">${team.penaltyScore}</td>
            <td class="col-total text-right">${team.totalScore}</td>
        `;
        tableRankingBody.appendChild(tr);
    });
}

// 印刷の実行
function handlePrint() {
    window.print();
}

// --- リセット機能 (モーダルダイアログ) ---
function showResetModal() {
    modalConfirm.classList.remove('hidden');
}

function hideResetModal() {
    modalConfirm.classList.add('hidden');
}

function resetAllData() {
    // 状態のクリア
    state = {
        schoolName: '',
        classType: 'alpha',
        classCount: 8,
        selectedClasses: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        bulkTeamCount: 6,
        numberRule: 'seq',
        classTeamCounts: {},
        classGroups: {},
        activeInputFilter: 'all',
        activeRankingFilter: 'all',
        teamCount: 48,
        teams: [],
        currentView: 'sec-setup'
    };
    
    // 入力のクリア
    if (inputSchoolName) inputSchoolName.value = '';
    if (inputClassCountPc) inputClassCountPc.value = 8;
    if (inputClassCountMob) inputClassCountMob.value = 8;
    if (inputBulkTeamCountPc) inputBulkTeamCountPc.value = 6;
    if (inputBulkTeamCountMob) inputBulkTeamCountMob.value = 6;
    if (divClassDetails) divClassDetails.classList.add('hidden');
    if (btnToggleDetails) btnToggleDetails.classList.remove('open');
    if (listTeamNames) listTeamNames.innerHTML = '';
    if (divTeamNamesSetup) divTeamNamesSetup.classList.add('hidden');
    if (listScoreInputs) listScoreInputs.innerHTML = '';
    if (inputSearchTeam) inputSearchTeam.value = '';

    // フィルターボタンとタブのリセット
    const filterInputBtns = document.querySelectorAll('.btn-filter-group');
    filterInputBtns.forEach(btn => {
        if (btn.getAttribute('data-filter') === 'all') btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const filterRankingTabs = document.querySelectorAll('.ranking-tab');
    filterRankingTabs.forEach(tab => {
        if (tab.getAttribute('data-filter') === 'all') tab.classList.add('active');
        else tab.classList.remove('active');
    });

    const subtitleEl = document.getElementById('print-ranking-subtitle');
    if (subtitleEl) subtitleEl.textContent = '総合';
    
    // 表示のクリア
    tableRankingBody.innerHTML = '';

    // UIを初期状態に再描画
    applyStateToSetupUI();
    
    saveState();
    hideResetModal();
    switchView('sec-setup');
}

// --- データ永続化 (localStorage) ---
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Error saving state to localStorage:', e);
    }
}

function loadState() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            state = JSON.parse(stored);
            return true;
        }
    } catch (e) {
        console.error('Error loading state from localStorage:', e);
    }
    return false;
}

// --- セキュリティ対策: HTMLエスケープ ---
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
