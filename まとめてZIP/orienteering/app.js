/**
 * Orienteering Ranker - Application State & Logic
 */

// --- アプリケーションの状態管理 ---
let state = {
    teamCount: 10,
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
const inputTeamCount = document.getElementById('input-team-count');
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
            
            // チーム数設定フィールドにも数値を反映しておく
            inputTeamCount.value = state.teamCount;
            
            // 入力中画面へ遷移
            switchView(state.currentView || 'sec-input');
        } else {
            switchView('sec-setup');
        }
    } else {
        switchView('sec-setup');
    }
}

// --- イベントリスナーの設定 ---
function setupEventListeners() {
    // 1. 設定画面
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
                alert('先にチーム数を設定してください。');
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

// --- 設定セクション ロジック ---
function handleStartSetup() {
    const count = parseInt(inputTeamCount.value);
    if (isNaN(count) || count < 1 || count > 100) {
        alert('チーム数は1〜100の間で設定してください。');
        return;
    }

    state.teamCount = count;
    
    // 一時的にチーム名のデフォルトリストを作成して表示
    listTeamNames.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        const teamObj = state.teams.find(t => t.id === i);
        const name = teamObj ? teamObj.name : `チーム ${i}`;
        
        const div = document.createElement('div');
        div.className = 'grid-input-item';
        div.innerHTML = `
            <label for="name-input-${i}">チーム ${i}</label>
            <input type="text" id="name-input-${i}" class="team-name-init-input" data-id="${i}" value="${name}" placeholder="チーム ${i}">
        `;
        listTeamNames.appendChild(div);
    }

    divTeamNamesSetup.classList.remove('hidden');
    // 下部までスクロール
    divTeamNamesSetup.scrollIntoView({ behavior: 'smooth' });
}

function handleConfirmNames() {
    const nameInputs = document.querySelectorAll('.team-name-init-input');
    const newTeams = [];

    nameInputs.forEach(input => {
        const id = parseInt(input.getAttribute('data-id'));
        const name = input.value.trim() || `チーム ${id}`;
        
        // 既存のデータを取得（スコア等を保持するため）
        const oldTeam = state.teams.find(t => t.id === id);
        
        newTeams.push({
            id: id,
            name: name,
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

    // スコア降順でソート（ディープコピーを作成）
    const sortedTeams = [...state.teams].sort((a, b) => b.totalScore - a.totalScore);

    // 順位決定処理 (共同順位対応)
    let currentRank = 1;
    let prevScore = null;

    sortedTeams.forEach((team, index) => {
        // 同点の場合は同じ順位、点数が異なればインデックス+1の順位を設定
        if (prevScore !== null && team.totalScore !== prevScore) {
            currentRank = index + 1;
        }
        prevScore = team.totalScore;

        const tr = document.createElement('tr');
        
        // 順位に応じたバッジを生成
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
    // 印刷用の日付をセット
    const today = new Date();
    const dateString = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    printDateEl.textContent = `出力日: ${dateString}`;
    
    // システムの印刷プレビューを実行
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
        teamCount: 10,
        teams: [],
        currentView: 'sec-setup'
    };
    
    // 入力のクリア
    inputTeamCount.value = 10;
    listTeamNames.innerHTML = '';
    divTeamNamesSetup.classList.add('hidden');
    listScoreInputs.innerHTML = '';
    inputSearchTeam.value = '';
    
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
