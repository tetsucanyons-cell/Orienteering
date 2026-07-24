/**
 * Orienteering Ranker - Application State & Logic
 */

// --- アプリケーションの状態管理 ---
let state = {
    schoolName: '',           // 学校名・大会名
    classType: 'alpha',       // 'alpha' (A, B...) or 'num' (1組, 2組...)
    selectedClasses: ['A', 'B', 'C', 'D'], // デフォルトで最初の4クラス
    numberRule: 'seq',        // 'seq' (全体連番) or 'reset' (クラスごと)
    classTeamCounts: {
        'A': 6, 'B': 6, 'C': 6, 'D': 6,
        'E': 6, 'F': 6, 'G': 6, 'H': 6,
        '1組': 6, '2組': 6, '3組': 6, '4組': 6,
        '5組': 6, '6組': 6, '7組': 6, '8組': 6
    },
    teamCount: 24,            // 合計チーム数 (初期値: 4クラス * 6チーム = 24)
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
const gridClassCheckboxes = document.getElementById('grid-class-checkboxes');
const radioNumberRules = document.getElementsByName('number-rule');
const listClassTeamCounts = document.getElementById('list-class-team-counts');
const spanTotalTeams = document.getElementById('span-total-teams');

// モーダル要素
const modalConfirm = document.getElementById('modal-confirm');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    setupEventListeners();
    
    // ローカルストレージからデータを復元
    if (loadState()) {
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

// --- イベントリスナーの設定 ---
function setupEventListeners() {
    // 1. 設定画面
    // 学校名入力イベント
    inputSchoolName.addEventListener('input', (e) => {
        state.schoolName = e.currentTarget.value.trim();
        saveState();
    });

    // クラス表記切り替えイベント
    radioClassTypes.forEach(radio => {
        radio.addEventListener('change', handleClassTypeChange);
    });

    // チーム番号ルール切り替えイベント
    radioNumberRules.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.numberRule = e.currentTarget.value;
            saveState();
        });
    });

    btnStartSetup.addEventListener('click', handleStartSetup);
    btnConfirmNames.addEventListener('click', handleConfirmNames);

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
    btnResetAll.addEventListener('click', showResetModal);
    btnConfirmCancel.addEventListener('click', hideResetModal);
    btnConfirmDelete.addEventListener('click', resetAllData);
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
    inputSchoolName.value = state.schoolName || '';

    // クラス表記ラジオボタンの適用
    radioClassTypes.forEach(radio => {
        if (radio.value === state.classType) {
            radio.checked = true;
        }
    });

    // 番号ルールラジオボタンの適用
    radioNumberRules.forEach(radio => {
        if (radio.value === state.numberRule) {
            radio.checked = true;
        }
    });

    // クラスチェックボックス一覧の描画
    renderClassCheckboxes();

    // クラスごとのチーム数入力リストの描画
    renderClassTeamCountsInputs();
}

// クラスタイプが変更された際の処理
function handleClassTypeChange(e) {
    const type = e.currentTarget.value;
    state.classType = type;

    // クラスタイプに合わせてデフォルトの選択クラスを設定
    if (type === 'alpha') {
        state.selectedClasses = ['A', 'B', 'C', 'D'];
    } else {
        state.selectedClasses = ['1組', '2組', '3組', '4組'];
    }

    renderClassCheckboxes();
    renderClassTeamCountsInputs();
    saveState();
}

// クラス選択用チェックボックスのレンダリング
function renderClassCheckboxes() {
    gridClassCheckboxes.innerHTML = '';
    
    // アルファベット (A〜H) または 組 (1〜8組)
    const classes = state.classType === 'alpha' 
        ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] 
        : ['1組', '2組', '3組', '4組', '5組', '6組', '7組', '8組'];

    classes.forEach(cls => {
        const wrapper = document.createElement('div');
        wrapper.className = 'class-checkbox-item';
        
        const isChecked = state.selectedClasses.includes(cls);
        
        wrapper.innerHTML = `
            <input type="checkbox" id="chk-class-${cls}" value="${cls}" ${isChecked ? 'checked' : ''}>
            <label for="chk-class-${cls}">${cls}</label>
        `;
        gridClassCheckboxes.appendChild(wrapper);

        // イベント登録
        wrapper.querySelector('input').addEventListener('change', handleClassCheckboxChange);
    });
}

// クラスチェックボックスの選択変更時の処理
function handleClassCheckboxChange(e) {
    const chk = e.currentTarget;
    const val = chk.value;

    if (chk.checked) {
        if (!state.selectedClasses.includes(val)) {
            state.selectedClasses.push(val);
        }
    } else {
        state.selectedClasses = state.selectedClasses.filter(c => c !== val);
    }

    // 順序を維持するためにソート (A〜H / 1組〜8組)
    const order = state.classType === 'alpha' 
        ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] 
        : ['1組', '2組', '3組', '4組', '5組', '6組', '7組', '8組'];
        
    state.selectedClasses.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    renderClassTeamCountsInputs();
    saveState();
}

// クラス別のチーム数入力リストのレンダリング
function renderClassTeamCountsInputs() {
    listClassTeamCounts.innerHTML = '';

    if (state.selectedClasses.length === 0) {
        listClassTeamCounts.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">クラスが選択されていません</div>';
        updateTotalTeamsDisplay();
        return;
    }

    state.selectedClasses.forEach(cls => {
        const row = document.createElement('div');
        row.className = 'class-count-row animate-fade-in';
        
        const count = state.classTeamCounts[cls] || 6;

        row.innerHTML = `
            <span>${cls}クラス</span>
            <input type="number" min="1" max="30" value="${count}" data-class="${cls}" class="class-team-count-input" inputmode="numeric">
        `;
        listClassTeamCounts.appendChild(row);

        // イベント登録
        row.querySelector('input').addEventListener('input', handleClassTeamCountChange);
        row.querySelector('input').addEventListener('focus', (e) => e.currentTarget.select());
    });

    updateTotalTeamsDisplay();
}

// 個別クラスのチーム数が変更された際の処理
function handleClassTeamCountChange(e) {
    const input = e.currentTarget;
    const cls = input.getAttribute('data-class');
    let val = parseInt(input.value);

    if (isNaN(val) || val < 1) val = 1;
    if (val > 30) val = 30; // 異常な数を防ぐ上限設定

    state.classTeamCounts[cls] = val;
    updateTotalTeamsDisplay();
    saveState();
}

// 合計チーム数の集計とバッジ表示の更新
function updateTotalTeamsDisplay() {
    let total = 0;
    state.selectedClasses.forEach(cls => {
        total += state.classTeamCounts[cls] || 6;
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
        const teamCountForClass = state.classTeamCounts[cls] || 6;
        
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
    listScoreInputs.innerHTML = '';
    
    state.teams.forEach(team => {
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
                <div class="score-input-group">
                    <label for="base-${team.id}">基本課題</label>
                    <input type="number" id="base-${team.id}" class="score-input" data-id="${team.id}" data-type="base" value="${team.baseScore}" inputmode="numeric">
                </div>
                <div class="score-input-group">
                    <label for="special-${team.id}">特別課題</label>
                    <input type="number" id="special-${team.id}" class="score-input" data-id="${team.id}" data-type="special" value="${team.specialScore}" inputmode="numeric">
                </div>
                <div class="score-input-group penalty">
                    <label class="text-danger" for="penalty-${team.id}">マイナス点</label>
                    <input type="number" id="penalty-${team.id}" class="score-input text-danger" data-id="${team.id}" data-type="penalty" value="${team.penaltyScore}" inputmode="numeric">
                </div>
            </div>
            
            <div class="score-card-total">
                合計点:<span id="total-${team.id}">${team.totalScore}</span>点
            </div>
        `;
        listScoreInputs.appendChild(card);
    });

    // スコア入力時のリアルタイム計算とデータ保存のイベントバインド
    const inputs = listScoreInputs.querySelectorAll('.score-input');
    inputs.forEach(input => {
        input.addEventListener('input', handleScoreChange);
        
        // フォーカス時にテキストを全選択して上書きしやすくする (スマホでの快適操作のため)
        input.addEventListener('focus', (e) => {
            e.currentTarget.select();
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
    const query = inputSearchTeam.value.toLowerCase().trim();
    const cards = listScoreInputs.querySelectorAll('.score-card');

    cards.forEach(card => {
        const teamName = card.getAttribute('data-team-name');
        if (teamName.includes(query)) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// --- 順位表セクション ロジック ---
function renderRanking() {
    tableRankingBody.innerHTML = '';

    if (state.teams.length === 0) {
        return;
    }

    // 学校名・大会名をタイトルに反映
    const title = state.schoolName ? `${state.schoolName} 結果順位表` : '結果順位表';
    printSchoolName.textContent = title;

    // 出力日を反映
    const today = new Date();
    const dateString = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    if (printDateEl) {
        printDateEl.textContent = `出力日: ${dateString}`;
    }

    // スコア降順でソート（ディープコピーを作成）
    const sortedTeams = [...state.teams].sort((a, b) => b.totalScore - a.totalScore);

    // 順位付け処理 (共同順位対応)
    let currentRank = 1;
    let prevScore = null;

    sortedTeams.forEach((team, index) => {
        if (prevScore !== null && team.totalScore !== prevScore) {
            currentRank = index + 1;
        }
        prevScore = team.totalScore;

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
        selectedClasses: ['A', 'B', 'C', 'D'],
        numberRule: 'seq',
        classTeamCounts: {
            'A': 6, 'B': 6, 'C': 6, 'D': 6,
            'E': 6, 'F': 6, 'G': 6, 'H': 6,
            '1組': 6, '2組': 6, '3組': 6, '4組': 6,
            '5組': 6, '6組': 6, '7組': 6, '8組': 6
        },
        teamCount: 24,
        teams: [],
        currentView: 'sec-setup'
    };
    
    // 入力のクリア
    inputSchoolName.value = '';
    listTeamNames.innerHTML = '';
    divTeamNamesSetup.classList.add('hidden');
    listScoreInputs.innerHTML = '';
    inputSearchTeam.value = '';
    
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
